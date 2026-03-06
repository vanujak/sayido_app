import { graphQlUrl } from "@/lib/api-config";
import { io, type Socket } from "socket.io-client";

type ChatSocket = Socket;

let socket: ChatSocket | null = null;

const getSocketBaseUrl = () => {
  if (!graphQlUrl) return "";
  try {
    const url = new URL(graphQlUrl);
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return graphQlUrl.replace(/\/graphql\/?$/, "");
  }
};

export const getChatSocket = (): ChatSocket | null => {
  if (socket) return socket;

  const baseUrl = getSocketBaseUrl();
  if (!baseUrl) return null;

  socket = io(`${baseUrl}/chat`, {
    transports: ["websocket", "polling"],
    withCredentials: true,
    autoConnect: true,
  });

  return socket;
};
