import { useEffect, useRef, useState } from "react";
import logo from "/assets/openai-logomark.svg";
import EventLog from "./EventLog";
import SessionControls from "./SessionControls";
import ToolPanel from "./ToolPanel";
import MedicalConsultationPanel from "./MedicalConsultationPanel";

export default function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [events, setEvents] = useState([]);
  const [dataChannel, setDataChannel] = useState(null);
  const [activePanel, setActivePanel] = useState("tool"); // 'tool' | 'medical'
  const [dbData, setDbData] = useState(null); // Estado para almacenar datos de la BD

  const peerConnection = useRef(null);
  const audioElement = useRef(null);

  const API_URL = typeof window !== "undefined" ? (import.meta.env.VITE_API_URL || window.location.origin) : "";

  async function fetchData() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const idGeneral = urlParams.get("idGeneral");
  
      console.log("🔍 ID General obtenido desde la URL:", idGeneral);
  
      if (!idGeneral) {
        console.warn("❌ No se encontró el parámetro idGeneral en la URL.");
        return;
      }
  
      console.log(`🔍 Consultando API en ${API_URL}/usuarios con idGeneral: ${idGeneral}`);
  
      const response = await fetch(`${API_URL}/usuarios?idGeneral=${idGeneral}`);
  
      if (!response.ok) {
        throw new Error(`Error al obtener datos: ${response.statusText}`);
      }
  
      let data = await response.json();
      console.log("✅ Datos obtenidos de la API:", data);
  
      if (Array.isArray(data) && data.length > 0) {
        data = data[0];
      }
  
      // 🔹 Convertir `encuestasalud` y `antecedentesfamiliares` a arrays si están en formato string JSON
      if (typeof data.encuestasalud === "string" && data.encuestasalud.trim() !== "") {
        try {
          data.encuestasalud = JSON.parse(data.encuestasalud);
        } catch (error) {
          console.error("⚠️ Error al parsear encuestasalud:", error);
        }
      }
  
      if (typeof data.antecedentesfamiliares === "string" && data.antecedentesfamiliares.trim() !== "") {
        try {
          data.antecedentesfamiliares = JSON.parse(data.antecedentesfamiliares);
        } catch (error) {
          console.error("⚠️ Error al parsear antecedentesfamiliares:", error);
        }
      }
  
      setDbData(data);
    } catch (error) {
      console.error("❌ Error al obtener datos de la base de datos:", error);
    }
  }
  

  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const idGeneral = urlParams.get("idGeneral");
  
    if (!idGeneral) {
      console.warn("🔄 Redirigiendo a una URL con idGeneral...");
      window.location.href = "/?idGeneral=0231ad34-769d-4c0c-a19b-efb2e64e8bd6"; // Cambia este ID por uno válido
    } else {
      fetchData();
    }
  }, []);
  

  useEffect(() => {
    console.log("📦 dbData actualizado:", dbData); // Log para ver si `dbData` cambia después de `fetchData`
  }, [dbData]);
  
  async function startSession() {
    const tokenResponse = await fetch(`${window.location.origin}/token`);
    const data = await tokenResponse.json();
    const EPHEMERAL_KEY = data.client_secret.value;
  
    const pc = new RTCPeerConnection();
  
    audioElement.current = document.createElement("audio");
    audioElement.current.autoplay = true;
    pc.ontrack = (e) => (audioElement.current.srcObject = e.streams[0]);
  
    const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
    pc.addTrack(ms.getTracks()[0]);
  
    const dc = pc.createDataChannel("oai-events");
    setDataChannel(dc);
  
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
  
    const baseUrl = "https://api.openai.com/v1/realtime";
    const model = "gpt-4o-realtime-preview-2024-12-17";
  
    console.log("🎙️ Enviando solicitud a OpenAI con voz Coral...");
  
    // 🔹 Enviamos directamente el `sdp` como `text/plain` en el `body`
    const sdpResponse = await fetch(`${baseUrl}?model=${model}&voice=coral`, {
      method: "POST",
      body: offer.sdp, // 🔹 Enviamos solo el `sdp`, sin JSON.stringify
      headers: {
        Authorization: `Bearer ${EPHEMERAL_KEY}`,
        "Content-Type": "application/sdp", // 🔹 Cambio importante
      },
    });
  
    if (!sdpResponse.ok) {
      throw new Error(`❌ Error en la solicitud a OpenAI: ${sdpResponse.statusText}`);
    }
  
    const answer = { type: "answer", sdp: await sdpResponse.text() };
    await pc.setRemoteDescription(answer);
  
    peerConnection.current = pc;
  }
  

  function stopSession() {
    if (dataChannel) {
      dataChannel.close();
    }
    if (peerConnection.current) {
      peerConnection.current.close();
    }

    setIsSessionActive(false);
    setDataChannel(null);
    peerConnection.current = null;
  }

  function sendClientEvent(message) {
    if (dataChannel) {
      message.event_id = message.event_id || crypto.randomUUID();
      dataChannel.send(JSON.stringify(message));
      setEvents((prev) => [message, ...prev]);
    } else {
      console.error("Failed to send message - no data channel available", message);
    }
  }

  function sendTextMessage(message, includeContext = false) {
    console.log("📩 Enviando mensaje al agente OpenAI:", message);
  
    let contextMessage = `Eres un asistente médico virtual. El usuario con el que hablas se llama ${dbData.primernombre}. Asegúrate de llamarlo por su nombre en la conversación. Se serio y concreto`;
  
    // 🟢 Agregar profesión u oficio
    if (dbData?.profesionuoficio) {
      contextMessage += ` Su profesión u oficio es: ${dbData.profesionuoficio}.`;
    }
  
    // 🟢 Procesar antecedentes familiares (convertir string en array si es necesario)
    let antecedentesTexto = "";
    let antecedentesArray = [];
  
    if (typeof dbData?.antecedentesfamiliares === "string") {
      try {
        antecedentesArray = JSON.parse(dbData.antecedentesfamiliares);
      } catch (error) {
        console.error("⚠️ Error al parsear antecedentesfamiliares:", error);
      }
    } else if (Array.isArray(dbData?.antecedentesfamiliares)) {
      antecedentesArray = dbData.antecedentesfamiliares;
    }
  
    if (antecedentesArray.length > 0) {
      antecedentesTexto = ` Tiene antecedentes familiares de: ${antecedentesArray.join(", ")}. Pregunta si ha tenido problemas de salud relacionados con estos antecedentes.`;
    } else {
      antecedentesTexto = ` Pregunta si tiene antecedentes familiares de enfermedades hereditarias como diabetes, hipertensión o infartos.`;
    }
    contextMessage += antecedentesTexto;
  
    // 🟢 Procesar encuesta de salud (convertir string en array si es necesario)
    let encuestaTexto = "";
    let encuestaArray = [];
  
    if (typeof dbData?.encuestasalud === "string") {
      try {
        encuestaArray = JSON.parse(dbData.encuestasalud);
      } catch (error) {
        console.error("⚠️ Error al parsear encuestasalud:", error);
      }
    } else if (Array.isArray(dbData?.encuestasalud)) {
      encuestaArray = dbData.encuestasalud;
    }
  
    if (encuestaArray.length > 0) {
      encuestaTexto = ` En la encuesta de salud mencionó: ${encuestaArray.join(", ")}. Pregunta si ha tenido síntomas recientes o si hay algo más que quiera agregar sobre estos problemas.`;
    } else {
      encuestaTexto = ` Pregunta sobre su historial de salud, incluyendo enfermedades crónicas, cirugías previas o síntomas recientes.`;
    }
    contextMessage += encuestaTexto;
  
    // 🟢 Mostrar en consola toda la información que se enviará al bot
    console.log("📦 Información enviada al bot:", {
      nombre: dbData.primernombre,
      profesion: dbData.profesionuoficio,
      antecedentesfamiliares: antecedentesArray,
      encuestasalud: encuestaArray,
      mensaje: message
    });
  
    const event = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          ...(includeContext ? [{ type: "input_text", text: contextMessage }] : []),
          { type: "input_text", text: message }
        ],
      },
    };
  
    sendClientEvent(event);
    sendClientEvent({ type: "response.create" });
  }
  
  
  
  

  function handlePanelChange(panel) {
    console.log("➡️ Cambiando al panel:", panel);
    setActivePanel(panel);
  
    if (panel === "medical") {
      console.log("🔎 dbData antes de enviar el contexto:", dbData);
  
      if (dbData?.primernombre) {
        console.log("✅ Nombre encontrado:", dbData.primernombre);
  
        sendTextMessage(`Hola ${dbData.primernombre}, ¿cómo puedo ayudarte hoy?`, true);
      } else {
        console.warn("⚠️ No se encontró el nombre en dbData.");
      }
    }
  }
  
  
  
  
  

  useEffect(() => {
    if (!dataChannel) return;
    const onMessage = (e) => {
      setEvents((prev) => [JSON.parse(e.data), ...prev]);
    };
    dataChannel.addEventListener("message", onMessage);
    dataChannel.addEventListener("open", () => {
      setIsSessionActive(true);
      setEvents([]);
    });
  
    return () => {
      dataChannel.removeEventListener("message", onMessage);
    };
  }, [dataChannel]);
  
  return (
    <>
      {/* NAVBAR */}
      <nav className="absolute top-0 left-0 right-0 h-16 flex items-center">
        <div className="flex items-center gap-4 w-full m-4 pb-2 border-0 border-b border-solid border-gray-200">
          <img style={{ width: "24px" }} src={logo} />
          <h1>Realtime Console</h1>
        </div>
      </nav>

      {/* MAIN SECTION */}
      <main className="absolute top-16 left-0 right-0 bottom-0">
        <section className="absolute top-0 left-0 right-[380px] bottom-0 flex">
          <section className="absolute top-0 left-0 right-0 bottom-32 px-4 overflow-y-auto">
            <EventLog events={events} />
          </section>
          <section className="absolute h-32 left-0 right-0 bottom-0 p-4">
            <SessionControls
              startSession={startSession}
              stopSession={stopSession}
              sendClientEvent={sendClientEvent}
              sendTextMessage={sendTextMessage}
              events={events}
              isSessionActive={isSessionActive}
            />
          </section>
        </section>

        {/* PANEL SELECTOR */}
        <section className="absolute top-0 w-[380px] right-0 bottom-0 p-4 pt-0 overflow-y-auto">
          <div className="mb-4 flex gap-2">
            <button
              className={`p-2 rounded-md ${activePanel === "tool" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
              onClick={() => handlePanelChange("tool")}
            >
              Tool Panel
            </button>
            <button
              className={`p-2 rounded-md ${activePanel === "medical" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
              onClick={() => handlePanelChange("medical")}
            >
              Medical Panel
            </button>
          </div>

          {activePanel === "tool" ? (
            <ToolPanel
              sendClientEvent={sendClientEvent}
              sendTextMessage={sendTextMessage}
              events={events}
              isSessionActive={isSessionActive}
            />
          ) : (
            <MedicalConsultationPanel
              sendClientEvent={sendClientEvent}
              sendTextMessage={sendTextMessage}
              events={events}
              isSessionActive={isSessionActive}
              stopSession={stopSession}
            />
          )}
        </section>
      </main>
    </>
  );
}
