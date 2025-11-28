import { createClient } from "redis";

let redis;

if (!global._redisClient) {
  const client = createClient({
    url: process.env.REDIS_URL,
  });

  client.on("error", (err) => console.error("Redis Client Error", err));

  client.connect();

  global._redisClient = client;
}

redis = global._redisClient;

export default redis;
