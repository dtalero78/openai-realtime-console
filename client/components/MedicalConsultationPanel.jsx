import { useEffect, useState } from "react";


const functionDescription = `
Call this function when a user asks for a medical consultation.
`;


const sessionUpdate = {
 type: "session.update",
 session: {
   tools: [
     {
       type: "function",
       name: "start_medical_consultation",
       description: functionDescription,
       parameters: {
         type: "object",
         strict: true,
         properties: {
           patient_name: {
             type: "string",
             description: "Name of the patient.",
           },
           symptoms: {
             type: "string",
             description: "Description of the symptoms.",
           },
           urgency: {
             type: "string",
             description: "Level of urgency (e.g., low, medium, high).",
           },
         },
         required: ["patient_name", "symptoms", "urgency"],
       },
     },
   ],
   tool_choice: "auto",
 },
};


function FunctionCallOutput({ functionCallOutput }) {
 const { patient_name, symptoms, urgency } = JSON.parse(functionCallOutput.arguments);


 return (
   <div className="flex flex-col gap-2">
     <p><strong>Patient Name:</strong> {patient_name}</p>
     <p><strong>Symptoms:</strong> {symptoms}</p>
     <p><strong>Urgency:</strong> {urgency}</p>
     <pre className="text-xs bg-gray-100 rounded-md p-2 overflow-x-auto">
       {JSON.stringify(functionCallOutput, null, 2)}
     </pre>
   </div>
 );
}


export default function MedicalConsultationPanel({
 isSessionActive,
 sendClientEvent,
 events,
 stopSession, // Prop para cerrar la sesión
}) {
 const [functionAdded, setFunctionAdded] = useState(false);
 const [functionCallOutput, setFunctionCallOutput] = useState(null);


 // Escucha eventos y maneja la lógica
 useEffect(() => {
   if (!events || events.length === 0) return;


   const firstEvent = events[events.length - 1];


   // Al iniciar la sesión, agregar la función
   if (!functionAdded && firstEvent.type === "session.created") {
     sendClientEvent(sessionUpdate);
     setFunctionAdded(true);
   }


   const mostRecentEvent = events[0];


   // Detectar cuando la consulta médica se completa
   if (
     mostRecentEvent.type === "response.done" &&
     mostRecentEvent.response.output
   ) {
     mostRecentEvent.response.output.forEach((output) => {
       if (
         output.type === "function_call" &&
         output.name === "start_medical_consultation"
       ) {
         setFunctionCallOutput(output);


         // Mensaje final antes de cerrar la sesión
         setTimeout(() => {
           sendClientEvent({
             type: "response.create",
             response: {
               instructions: "La consulta médica ha finalizado.",
             },
           });


           // Cerrar la sesión después de un breve retraso
           setTimeout(() => {
             console.log("🔴 Cerrando la sesión después de la consulta médica...");
             stopSession(); // Llamar a la función para cerrar el socket
           }, 1000); // Espera 1 segundo antes de cerrar
         }, 500);
       }
     });
   }
 }, [events, sendClientEvent, stopSession]);


 // Reiniciar el estado cuando la sesión termina
 useEffect(() => {
   if (!isSessionActive) {
     setFunctionAdded(false);
     setFunctionCallOutput(null);
   }
 }, [isSessionActive]);


 return (
   <section className="h-full w-full flex flex-col gap-4">
     <div className="h-full bg-gray-50 rounded-md p-4">
       <h2 className="text-lg font-bold">Medical Consultation Tool</h2>
       {isSessionActive ? (
         functionCallOutput ? (
           <FunctionCallOutput functionCallOutput={functionCallOutput} />
         ) : (
           <p>Ask for medical consultation...</p>
         )
       ) : (
         <p>Session closed. Start a new session to use this tool...</p>
       )}
     </div>
   </section>
 );
}
