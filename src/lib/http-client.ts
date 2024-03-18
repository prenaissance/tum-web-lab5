import net from "node:net";
import tls from "node:tls";
import fs from "fs/promises";

export type HttpResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

type Cache = Record<string, HttpResponse>;

const USER_AGENT =
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0";
const getCache = async (): Promise<Cache> => {
  try {
    const data = await fs.readFile("cache.json", "utf-8");
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
};

const saveCache = async (cache: Cache) => {
  await fs.writeFile("cache.json", JSON.stringify(cache, null, 2));
};

let cache: Cache = await getCache();

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
  const { body, headers } = await get(url);
  const contentType = headers["content-type"];

  if (!contentType.includes("application/json")) {
    return null; // Not JSON data
  }

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
  const isTLS = urlObject.protocol === "https:";
  const port = isTLS ? 443 : 80;
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

  const request = `${method} ${url} HTTP/1.1\r\nConnection: close\r\nHost: ${host}\r\nUser-Agent: ${USER_AGENT}\r\n\r\n`;

  return new Promise<HttpResponse>((resolve, reject) => {
    const client = getSocket(url, request);

    const chunks: Buffer[] = [];
    client.on("data", (chunk) => {
      chunks.push(chunk);
    });

    client.on("error", reject);

    client.on("end", () => {
      const response = Buffer.concat(chunks).toString("utf-8");
      const [httpHeader, httpBody] = response.split("\r\n\r\n", 2);
      const [statusLine, ...rawHeaders] = httpHeader.split("\r\n");

      if (followRedirects > 0 && redirectHttpRegex.test(response)) {
        const locationHeader = rawHeaders.find((line) =>
          line.match(/^Location:/i)
        );
        if (locationHeader) {
          const locationUrl = locationHeader.split(" ")[1];
          const newUrl = new URL(locationUrl, url);
          const promise = sendRequest(
            newUrl.toString(),
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
      const [statusCode] = statusLine.split(" ");
      const headers = rawHeaders.reduce((acc, line) => {
        const [key, value] = line.split(": ");
        acc[key.toLowerCase()] = value;
        return acc;
      }, {} as Record<string, string>);

      resolve({
        statusCode: parseInt(statusCode, 10),
        headers,
        body,
      });
    });
  });
};
