import Fastify from "fastify";
import FastifyVite from "@fastify/vite";
import fastifyEnv from "@fastify/env";
import pg from "pg";

const { Pool } = pg;

// Configurar Fastify
const server = Fastify({
  logger: {
    transport: {
      target: "@fastify/one-line-logger",
    },
  },
});

// Esquema de variables de entorno
const schema = {
  type: "object",
  required: ["OPENAI_API_KEY", "PG_USER", "PG_HOST", "PG_DATABASE", "PG_PASSWORD", "PG_PORT"],
  properties: {
    OPENAI_API_KEY: { type: "string" },
    PG_USER: { type: "string" },
    PG_HOST: { type: "string" },
    PG_DATABASE: { type: "string" },
    PG_PASSWORD: { type: "string" },
    PG_PORT: { type: "string" },
  },
};

// Registrar fastifyEnv para cargar variables de entorno
await server.register(fastifyEnv, { dotenv: true, schema });

// ✅ Conexión a PostgreSQL (sin usar `server.after`)
const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
  ssl: { rejectUnauthorized: false },
});

try {
  const client = await pool.connect();
  console.log("✅ Conexión a PostgreSQL establecida correctamente.");
  client.release();
} catch (err) {
  console.error("❌ Error al conectar a PostgreSQL:", err);
  process.exit(1); // Si hay un error, detiene el servidor
}

// ✅ Endpoint `/usuarios`
server.get("/usuarios", async (request, reply) => {
  console.log("🔍 Consultando base de datos con idGeneral:", request.query.idGeneral);

  if (!request.query.idGeneral) {
    return reply.code(400).send({ error: "❌ Faltante 'idGeneral' en la consulta." });
  }

  try {
    const result = await pool.query('SELECT * FROM usuarios WHERE "idgeneral" = $1', [request.query.idGeneral]);

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "⚠️ No se encontraron registros." });
    }

    reply.send(result.rows);
  } catch (error) {
    console.error("❌ Error al consultar la base de datos:", error);
    reply.code(500).send({ error: "❌ Error interno del servidor." });
  }
});

// ✅ Endpoint `/token`
server.get("/token", async (request, reply) => {
  try {
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice: "verse",
      }),
    });

    const data = await response.json();
    reply.send(data);
  } catch (error) {
    console.error("❌ Error al obtener el token:", error);
    reply.code(500).send({ error: "❌ Error interno del servidor." });
  }
});

// ✅ Registrar Fastify Vite (sin `server.after`)
await server.register(FastifyVite, {
  root: import.meta.url,
  renderer: "@fastify/react",
});

await server.vite.ready();

// ✅ Iniciar servidor como en el código antiguo
await server.listen({ port: process.env.PORT || 3000 });

console.log("🚀 Servidor iniciado en el puerto", process.env.PORT || 3000);
console.log(server.printRoutes()); // Ver rutas registradas
