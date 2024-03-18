import * as net from "node:net";
import * as tls from "node:tls";
import fs from "fs/promises";

const USER_AGENT =
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0";
const getCache = async (): Promise<Record<string, string>> => {
  try {
    const data = await fs.readFile("cache.json", "utf-8");
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
};

const saveCache = async (cache: Record<string, string>) => {
  await fs.writeFile("cache.json", JSON.stringify(cache, null, 2));
};

let cache: Record<string, string> = await getCache();

const redirectHttpRegex = /HTTP\/1.1 3\d\d/; // Match 3xx redirect status codes

export const get = async (url: string, followRedirects = 5) => {
  const cachedResponse = cache[url];
  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await sendRequest(url, "GET", followRedirects);
  cache[url] = response;
  saveCache(cache);
  return response;
};

export const getJson = async <T>(url: string) => {
  const response = await get(url);
  if (!response.startsWith("HTTP/1.1")) {
    throw new Error("Invalid response format");
  }

  const lines = response.split("\r\n");
  const contentTypeHeader = lines.find((line) =>
    line.startsWith("Content-Type:")
  );

  if (!contentTypeHeader || !contentTypeHeader.includes("application/json")) {
    return null; // Not JSON data
  }

  const body = response.split("\r\n\r\n")[1];
  try {
    return JSON.parse(body) as T;
  } catch (error) {
    console.error("Error parsing JSON response:", error);
    return null;
  }
};

const getSocket = (url: string, request: string) => {
  const urlObject = new URL(url);
  const host = urlObject.hostname;
  const port = urlObject.protocol === "https:" ? 443 : 80;
  const isTLS = urlObject.protocol === "https:";
  const socket = isTLS
    ? tls.connect({ host, port, rejectUnauthorized: false })
    : net.connect({ host, port });
  socket.once(isTLS ? "secureConnect" : "connect", () => {
    socket.write(request);
  });
  return socket;
};

const sendRequest = (url: string, method = "GET", followRedirects = 5) => {
  const urlObject = new URL(url);
  const host = urlObject.hostname;

  const request = `${method} ${urlObject.pathname}${urlObject.search} HTTP/1.1\r\nConnection: close\r\nHost: ${host}\r\nUser-Agent: ${USER_AGENT}\r\n\r\n`;

  return new Promise<string>((resolve, reject) => {
    const client = getSocket(url, request);

    const chunks: Buffer[] = [];
    client.on("data", (chunk) => {
      chunks.push(chunk);
    });

    client.on("error", reject);

    client.on("end", () => {
      const response = Buffer.concat(chunks).toString("utf-8");
      if (followRedirects > 0 && redirectHttpRegex.test(response)) {
        const locationHeader = response
          .split("\r\n")
          .find((line) => line.match(/^Location:/i));
        console.log(locationHeader);
        if (locationHeader) {
          const locationUrl = locationHeader.split(" ")[1];
          const promise = sendRequest(
            locationUrl,
            method,
            followRedirects - 1
          ).then((response) => {
            cache[url] = response;
            saveCache(cache);
            return response;
          });
          resolve(promise);
        }
      }
      const body = response.split("\r\n\r\n")[1];
      resolve(body);
    });
  });
};
