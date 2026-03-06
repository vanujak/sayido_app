import { apiCredentials, graphQlUrl } from "@/lib/api-config";
import { getChatSocket } from "@/lib/chat-socket";
import { getVendorSession, setVendorSession } from "@/lib/vendor-session";
import { useGlobalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type ChatMessage = {
  id?: string;
  content: string;
  senderId?: string;
  senderType: string;
  timestamp: string;
};

type VendorChat = {
  chatId: string;
  visitorId: string;
  offeringId: string;
  updatedAt: string;
  messages: ChatMessage[];
};

type VisitorDetails = {
  visitor_fname?: string;
  partner_fname?: string;
  email?: string;
};

type ChatRow = {
  chatId: string;
  visitorName: string;
  visitorEmail: string;
  offeringName: string;
  lastMessage: string;
  lastMessageAt: string;
  messages: ChatMessage[];
};

const toText = (value: unknown, fallback = "") =>
  typeof value === "string" && value.trim() ? value : fallback;

const graphQlRequest = async <TData>(
  query: string,
  variables: Record<string, unknown>,
): Promise<TData> => {
  if (!graphQlUrl) {
    throw new Error("Missing EXPO_PUBLIC_GRAPHQL_URL");
  }

  const response = await fetch(graphQlUrl, {
    method: "POST",
    credentials: apiCredentials,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  let payload: { data?: TData; errors?: Array<{ message?: string }> } = {};
  try {
    payload = (await response.json()) as {
      data?: TData;
      errors?: Array<{ message?: string }>;
    };
  } catch {
    payload = {};
  }

  if (!response.ok || payload.errors?.length) {
    const message = payload.errors
      ?.map((entry) => entry.message)
      .filter((entry): entry is string => !!entry)
      .join(", ");
    throw new Error(message || `GraphQL request failed (${response.status})`);
  }

  if (!payload.data) {
    throw new Error("GraphQL response has no data");
  }

  return payload.data;
};

const readVendorIdFromCookie = () => {
  if (typeof document === "undefined" || typeof atob !== "function") return "";
  const tokenPair = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("access_tokenVendor="));

  if (!tokenPair) return "";
  const token = tokenPair.slice("access_tokenVendor=".length);
  const jwtParts = token.split(".");
  if (jwtParts.length < 2) return "";

  try {
    const payload = JSON.parse(
      atob(jwtParts[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as {
      sub?: string;
    };
    return toText(payload.sub);
  } catch {
    return "";
  }
};

const loadVendorIdByEmail = async (email: string): Promise<string> => {
  if (!email.trim()) return "";

  const data = await graphQlRequest<{
    findVendorByEmail?: { id?: string; email?: string } | null;
  }>(
    `
      query FindVendorByEmailForLookup($email: String!) {
        findVendorByEmail(email: $email) {
          id
          email
        }
      }
    `,
    { email: email.trim() },
  );

  return toText(data.findVendorByEmail?.id);
};

const loadVendorChats = async (vendorId: string): Promise<VendorChat[]> => {
  const data = await graphQlRequest<{
    getVendorChats?: Array<{
      chatId?: string;
      visitorId?: string;
      offeringId?: string;
      updatedAt?: string;
      messages?: Array<{
        id?: string;
        content?: string;
        senderId?: string;
        senderType?: string;
        timestamp?: string;
      }>;
    }>;
  }>(
    `
      query GetVendorChats($vendorId: String!) {
        getVendorChats(vendorId: $vendorId) {
          chatId
          visitorId
          offeringId
          updatedAt
          messages {
            id
            content
            senderId
            senderType
            timestamp
          }
        }
      }
    `,
    { vendorId },
  );

  const rows = Array.isArray(data.getVendorChats) ? data.getVendorChats : [];
  return rows
    .map((item) => ({
      chatId: toText(item.chatId),
      visitorId: toText(item.visitorId),
      offeringId: toText(item.offeringId),
      updatedAt: toText(item.updatedAt),
      messages: Array.isArray(item.messages)
        ? item.messages.map((message) => ({
            id: toText(message.id),
            content: toText(message.content),
            senderId: toText(message.senderId),
            senderType: toText(message.senderType),
            timestamp: toText(message.timestamp),
          }))
        : [],
    }))
    .filter((item) => !!item.chatId);
};

const sendVendorMessage = async (
  chatId: string,
  content: string,
  vendorSenderId: string,
): Promise<ChatMessage[]> => {
  const data = await graphQlRequest<{
    sendQuoteMessage?: {
      messages?: Array<{
        id?: string;
        content?: string;
        senderId?: string;
        senderType?: string;
        timestamp?: string;
      }>;
    } | null;
  }>(
    `
      mutation SendQuoteMessageFromVendor(
        $chatId: String!
        $content: String!
        $vendorSenderId: String
      ) {
        sendQuoteMessage(
          chatId: $chatId
          content: $content
          vendorSenderId: $vendorSenderId
        ) {
          messages {
            id
            content
            senderId
            senderType
            timestamp
          }
        }
      }
    `,
    {
      chatId,
      content,
      vendorSenderId,
    },
  );

  const messages = data.sendQuoteMessage?.messages ?? [];
  return messages.map((message) => ({
    id: toText(message.id),
    content: toText(message.content),
    senderId: toText(message.senderId),
    senderType: toText(message.senderType),
    timestamp: toText(message.timestamp),
  }));
};

const markChatAsRead = async (chatId: string, userId: string): Promise<void> => {
  await graphQlRequest<{
    markChatAsRead?: boolean;
  }>(
    `
      mutation MarkChatAsReadFromVendor($chatId: String!, $userId: String!, $userType: String!) {
        markChatAsRead(chatId: $chatId, userId: $userId, userType: $userType)
      }
    `,
    { chatId, userId, userType: "vendor" },
  );
};

const loadVisitorById = async (id: string): Promise<VisitorDetails> => {
  const data = await graphQlRequest<{
    findVisitorById?: VisitorDetails | null;
  }>(
    `
      query FindVisitorByIdForChats($id: String!) {
        findVisitorById(id: $id) {
          visitor_fname
          partner_fname
          email
        }
      }
    `,
    { id },
  );

  return data.findVisitorById || {};
};

const loadOfferingNameById = async (id: string): Promise<string> => {
  const data = await graphQlRequest<{
    findOfferingById?: { name?: string } | null;
  }>(
    `
      query FindOfferingByIdForChats($id: String!) {
        findOfferingById(id: $id) {
          name
        }
      }
    `,
    { id },
  );

  return toText(data.findOfferingById?.name, "Offering");
};

const formatTimeAgo = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
};

export default function ChatScreen() {
  const vendorSession = getVendorSession();
  const sessionEmail = vendorSession.email || "";
  const params = useGlobalSearchParams<{
    id?: string;
    vendor_id?: string;
    vendorId?: string;
    email?: string;
    vendor_email?: string;
    chatId?: string;
  }>();

  const [rows, setRows] = useState<ChatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeChatId, setActiveChatId] = useState("");
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [resolvedVendorId, setResolvedVendorId] = useState("");
  const activeChatIdRef = useRef("");
  const vendorIdRef = useRef("");
  const rowsRef = useRef<ChatRow[]>([]);
  const joinedChatsRef = useRef(new Set<string>());
  const lastUnreadRefreshAtRef = useRef(0);

  const vendorId =
    (typeof params.vendor_id === "string" && params.vendor_id) ||
    (typeof params.vendorId === "string" && params.vendorId) ||
    (typeof params.id === "string" && params.id) ||
    vendorSession.vendorId ||
    process.env.EXPO_PUBLIC_VENDOR_ID ||
    "";
  const vendorEmail =
    (typeof params.vendor_email === "string" && params.vendor_email) ||
    (typeof params.email === "string" && params.email) ||
    sessionEmail ||
    "";

  const loadData = useCallback(async () => {
    setErrorMessage("");
    try {
      const resolvedVendorId =
        vendorId || (await loadVendorIdByEmail(vendorEmail)) || readVendorIdFromCookie();

      if (!resolvedVendorId) {
        throw new Error("Could not resolve vendor id for chats.");
      }

      setVendorSession({
        vendorId: resolvedVendorId,
        email: vendorEmail || sessionEmail,
      });
      setResolvedVendorId(resolvedVendorId);

      const chats = await loadVendorChats(resolvedVendorId);

      const visitorIds = [...new Set(chats.map((chat) => chat.visitorId).filter(Boolean))];
      const offeringIds = [...new Set(chats.map((chat) => chat.offeringId).filter(Boolean))];

      const [visitorEntries, offeringEntries] = await Promise.all([
        Promise.all(
          visitorIds.map(async (id) => {
            try {
              return [id, await loadVisitorById(id)] as const;
            } catch {
              return [id, {} as VisitorDetails] as const;
            }
          }),
        ),
        Promise.all(
          offeringIds.map(async (id) => {
            try {
              return [id, await loadOfferingNameById(id)] as const;
            } catch {
              return [id, "Offering"] as const;
            }
          }),
        ),
      ]);

      const visitorMap = new Map<string, VisitorDetails>(visitorEntries);
      const offeringMap = new Map<string, string>(offeringEntries);

      const normalizedRows = chats.map((chat) => {
        const visitor = visitorMap.get(chat.visitorId) || {};
        const firstName = toText(visitor.visitor_fname);
        const partnerName = toText(visitor.partner_fname);
        const visitorName = [firstName, partnerName].filter(Boolean).join(" & ") || "Client";
        const lastMessage = chat.messages[chat.messages.length - 1];

        return {
          chatId: chat.chatId,
          visitorName,
          visitorEmail: toText(visitor.email),
          offeringName: offeringMap.get(chat.offeringId) || "Offering",
          lastMessage: toText(lastMessage?.content, "No messages yet"),
          lastMessageAt: toText(lastMessage?.timestamp || chat.updatedAt),
          messages: chat.messages,
        };
      });

      normalizedRows.sort((a, b) => {
        const aDate = new Date(a.lastMessageAt).getTime();
        const bDate = new Date(b.lastMessageAt).getTime();
        return (Number.isNaN(bDate) ? 0 : bDate) - (Number.isNaN(aDate) ? 0 : aDate);
      });

      setRows(normalizedRows);
    } catch (error) {
      setRows([]);
      setErrorMessage(error instanceof Error ? error.message : "Unable to load chats right now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionEmail, vendorEmail, vendorId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setSendError("");
  }, [activeChatId]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    vendorIdRef.current = resolvedVendorId;
  }, [resolvedVendorId]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    if (typeof params.chatId !== "string" || !params.chatId) return;
    if (!rows.some((row) => row.chatId === params.chatId)) return;
    setActiveChatId(params.chatId);
  }, [params.chatId, rows]);

  useEffect(() => {
    const resolvedVendorId = vendorId || getVendorSession().vendorId || "";
    if (!activeChatId || !resolvedVendorId) return;

    void markChatAsRead(activeChatId, resolvedVendorId);
  }, [activeChatId, vendorId]);

  const activeChat = useMemo(
    () => rows.find((row) => row.chatId === activeChatId) || null,
    [activeChatId, rows],
  );

  useEffect(() => {
    if (!resolvedVendorId) return;
    const socket = getChatSocket();
    if (!socket) return;

    const joinKnownChats = () => {
      rowsRef.current.forEach((row) => {
        if (!row.chatId || joinedChatsRef.current.has(row.chatId)) return;
        socket.emit("joinChat", { chatId: row.chatId, userId: resolvedVendorId });
        joinedChatsRef.current.add(row.chatId);
      });
    };

    const handleConnect = () => {
      joinedChatsRef.current.clear();
      socket.emit("register", {
        userId: resolvedVendorId,
        userType: "vendor",
      });
      joinKnownChats();
    };

    const handleDisconnect = () => {
      joinedChatsRef.current.clear();
    };

    const handleNewMessage = (payload: {
      chatId?: string;
      message?: {
        id?: string;
        content?: string;
        senderId?: string;
        senderType?: string;
        timestamp?: string;
      };
      chat?: {
        messages?: Array<{
          id?: string;
          content?: string;
          senderId?: string;
          senderType?: string;
          timestamp?: string;
        }>;
      };
    }) => {
      const chatId = toText(payload.chatId);
      if (!chatId) return;

      const socketMessages = Array.isArray(payload.chat?.messages) ? payload.chat.messages : [];
      const normalizedMessages = socketMessages.length
        ? socketMessages.map((message) => ({
            id: toText(message.id),
            content: toText(message.content),
            senderId: toText(message.senderId),
            senderType: toText(message.senderType),
            timestamp: toText(message.timestamp),
          }))
        : [];

      const fallbackMessage = payload.message
        ? {
            id: toText(payload.message.id),
            content: toText(payload.message.content),
            senderId: toText(payload.message.senderId),
            senderType: toText(payload.message.senderType),
            timestamp: toText(payload.message.timestamp, new Date().toISOString()),
          }
        : null;

      setRows((currentRows) => {
        let found = false;
        const nextRows = currentRows.map((row) => {
          if (row.chatId !== chatId) return row;
          found = true;

          const nextMessages = normalizedMessages.length
            ? normalizedMessages
            : fallbackMessage
              ? row.messages.some((msg) => msg.id && msg.id === fallbackMessage.id)
                ? row.messages
                : [...row.messages, fallbackMessage]
              : row.messages;
          const latest = nextMessages[nextMessages.length - 1];

          return {
            ...row,
            messages: nextMessages,
            lastMessage: toText(latest?.content, row.lastMessage),
            lastMessageAt: toText(latest?.timestamp, row.lastMessageAt),
          };
        });

        if (!found) {
          void loadData();
          return currentRows;
        }

        return nextRows.sort((a, b) => {
          const aDate = new Date(a.lastMessageAt).getTime();
          const bDate = new Date(b.lastMessageAt).getTime();
          return (Number.isNaN(bDate) ? 0 : bDate) - (Number.isNaN(aDate) ? 0 : aDate);
        });
      });

      if (
        activeChatIdRef.current === chatId &&
        fallbackMessage?.senderType.toLowerCase() !== "vendor" &&
        vendorIdRef.current
      ) {
        void markChatAsRead(chatId, vendorIdRef.current);
      }
    };

    const handleUnreadCount = () => {
      const now = Date.now();
      if (now - lastUnreadRefreshAtRef.current < 1000) return;
      lastUnreadRefreshAtRef.current = now;
      void loadData();
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("newMessage", handleNewMessage);
    socket.on("unreadCount", handleUnreadCount);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("newMessage", handleNewMessage);
      socket.off("unreadCount", handleUnreadCount);
    };
  }, [loadData, resolvedVendorId]);

  useEffect(() => {
    if (!resolvedVendorId || !rows.length) return;
    const socket = getChatSocket();
    if (!socket || !socket.connected) return;

    rows.forEach((row) => {
      if (!row.chatId || joinedChatsRef.current.has(row.chatId)) return;
      socket.emit("joinChat", { chatId: row.chatId, userId: resolvedVendorId });
      joinedChatsRef.current.add(row.chatId);
    });
  }, [resolvedVendorId, rows]);

  const handleSendReply = useCallback(async () => {
    const trimmed = replyText.trim();
    if (!trimmed || !activeChatId) return;
    if (sending) return;

    const senderVendorId = vendorId || getVendorSession().vendorId || "";
    if (!senderVendorId) {
      setSendError("Could not resolve vendor id to send message.");
      return;
    }

    setSending(true);
    setSendError("");
    try {
      const updatedMessages = await sendVendorMessage(activeChatId, trimmed, senderVendorId);
      const fallbackTimestamp = new Date().toISOString();
      const latestMessage = updatedMessages[updatedMessages.length - 1];

      setRows((currentRows) => {
        const updated = currentRows.map((row) => {
          if (row.chatId !== activeChatId) return row;
          return {
            ...row,
            messages: updatedMessages.length ? updatedMessages : row.messages,
            lastMessage: toText(latestMessage?.content, trimmed),
            lastMessageAt: toText(latestMessage?.timestamp, fallbackTimestamp),
          };
        });

        return updated.sort((a, b) => {
          const aDate = new Date(a.lastMessageAt).getTime();
          const bDate = new Date(b.lastMessageAt).getTime();
          return (Number.isNaN(bDate) ? 0 : bDate) - (Number.isNaN(aDate) ? 0 : aDate);
        });
      });
      setReplyText("");
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Unable to send message.");
    } finally {
      setSending(false);
    }
  }, [activeChatId, replyText, sending, vendorId]);

  const content = useMemo(() => {
    if (loading) {
      return (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#0EA5E9" />
          <Text style={styles.stateText}>Loading chats...</Text>
        </View>
      );
    }

    if (errorMessage) {
      return (
        <View style={[styles.centerState, styles.errorCard]}>
          <Text style={styles.errorTitle}>Unable to load vendor chats</Text>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      );
    }

    if (!rows.length) {
      return (
        <View style={styles.centerState}>
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptySubtitle}>
            Chats from couples will appear here once they message you.
          </Text>
        </View>
      );
    }

    if (activeChat) {
      return (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.chatDetail}
        >
          <Pressable style={styles.backButton} onPress={() => setActiveChatId("")}>
            <Text style={styles.backButtonText}>Back to chats</Text>
          </Pressable>
          <View style={styles.chatHeader}>
            <Text style={styles.chatTitle} numberOfLines={1}>
              {activeChat.visitorName}
            </Text>
            <Text style={styles.chatSubtitle} numberOfLines={1}>
              {activeChat.offeringName}
            </Text>
          </View>
          <ScrollView contentContainerStyle={styles.messagesList}>
            {activeChat.messages.length ? (
              activeChat.messages.map((message, index) => {
                const mine = message.senderType.toLowerCase() === "vendor";
                return (
                  <View
                    key={`${message.timestamp || "msg"}-${index}`}
                    style={[
                      styles.messageBubble,
                      mine ? styles.myMessageBubble : styles.otherMessageBubble,
                    ]}
                  >
                    <Text style={mine ? styles.myMessageText : styles.otherMessageText}>
                      {toText(message.content, "...")}
                    </Text>
                    <Text style={mine ? styles.myMessageTime : styles.otherMessageTime}>
                      {formatTimeAgo(message.timestamp)}
                    </Text>
                  </View>
                );
              })
            ) : (
              <Text style={styles.emptySubtitle}>No messages in this chat yet.</Text>
            )}
          </ScrollView>
          <View style={styles.replyBar}>
            <TextInput
              placeholder="Type your reply..."
              placeholderTextColor="#9CA3AF"
              value={replyText}
              onChangeText={setReplyText}
              style={styles.replyInput}
              multiline
            />
            <Pressable
              style={[
                styles.sendButton,
                (!replyText.trim() || sending) && styles.sendButtonDisabled,
              ]}
              onPress={handleSendReply}
              disabled={!replyText.trim() || sending}
            >
              <Text style={styles.sendButtonText}>{sending ? "Sending..." : "Send"}</Text>
            </Pressable>
          </View>
          {!!sendError && <Text style={styles.sendErrorText}>{sendError}</Text>}
        </KeyboardAvoidingView>
      );
    }

    return (
      <View style={styles.list}>
        {rows.map((row) => (
          <Pressable key={row.chatId} style={styles.card} onPress={() => setActiveChatId(row.chatId)}>
            <View style={styles.rowHeader}>
              <Text style={styles.clientName} numberOfLines={1}>
                {row.visitorName}
              </Text>
              <Text style={styles.time}>{formatTimeAgo(row.lastMessageAt)}</Text>
            </View>
            <Text style={styles.offering} numberOfLines={1}>
              {row.offeringName}
            </Text>
            {!!row.visitorEmail && (
              <Text style={styles.email} numberOfLines={1}>
                {row.visitorEmail}
              </Text>
            )}
            <Text style={styles.message} numberOfLines={2}>
              {row.lastMessage}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  }, [activeChat, errorMessage, handleSendReply, loading, replyText, rows, sendError]);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true);
          loadData();
        }} />}
      >
        <Text style={styles.pageTitle}>Vendor Chats</Text>
        <Text style={styles.pageSubtitle}>Messages with couples and clients</Text>
        {content}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFF8F3",
  },
  container: {
    padding: 20,
    paddingBottom: 28,
  },
  pageTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 28,
    color: "#111827",
  },
  pageSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
    marginBottom: 14,
  },
  list: {
    gap: 12,
  },
  chatDetail: {
    minHeight: 420,
    gap: 10,
  },
  backButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#FFF1E8",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  backButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: "#FC7B54",
  },
  chatHeader: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8EDF5",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chatTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: "#111827",
  },
  chatSubtitle: {
    marginTop: 4,
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: "#6B7280",
  },
  messagesList: {
    gap: 8,
    paddingVertical: 4,
  },
  messageBubble: {
    maxWidth: "85%",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  myMessageBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#FC7B54",
  },
  otherMessageBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8EDF5",
  },
  myMessageText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#FFFFFF",
    lineHeight: 18,
  },
  otherMessageText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#374151",
    lineHeight: 18,
  },
  myMessageTime: {
    marginTop: 4,
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: "#FFE8DE",
  },
  otherMessageTime: {
    marginTop: 4,
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: "#9CA3AF",
  },
  replyBar: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  replyInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8EDF5",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#111827",
  },
  sendButton: {
    backgroundColor: "#FC7B54",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  sendButtonDisabled: {
    opacity: 0.55,
  },
  sendButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    color: "#FFFFFF",
    fontSize: 13,
  },
  sendErrorText: {
    marginTop: 6,
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: "#B91C1C",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8EDF5",
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  clientName: {
    flex: 1,
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
    color: "#111827",
  },
  time: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 12,
    color: "#6B7280",
  },
  offering: {
    marginTop: 6,
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: "#0EA5E9",
  },
  email: {
    marginTop: 4,
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: "#9CA3AF",
  },
  message: {
    marginTop: 6,
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  centerState: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  stateText: {
    marginTop: 10,
    fontFamily: "Montserrat_500Medium",
    color: "#6B7280",
  },
  errorCard: {
    backgroundColor: "#FFF1F2",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: "#991B1B",
    textAlign: "center",
  },
  errorText: {
    marginTop: 6,
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#B91C1C",
    textAlign: "center",
  },
  emptyTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 20,
    color: "#374151",
    textAlign: "center",
  },
  emptySubtitle: {
    marginTop: 8,
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },
});
