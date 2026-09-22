import { ChatSkeleton } from "@/components/ui/skeletons";
import { useAppTheme } from "@/context/ThemeContext";
import { apiCredentials, graphQlUrl } from "@/lib/api-config";
import { getChatSocket } from "@/lib/chat-socket";
import { formatCoupleName } from "@/lib/formatCoupleName";
import { getVendorSession, setVendorSession } from "@/lib/vendor-session";
import { useFocusEffect, useGlobalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, ChevronRight, Mail, Send } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
  serviceId: string;
  updatedAt: string;
  messages: ChatMessage[];
};

type VisitorDetails = {
  visitor_fname?: string;
  partner_fname?: string;
  email?: string;
  profile_pic_url?: string;
};

type ChatRow = {
  chatId: string;
  visitorName: string;
  visitorEmail: string;
  visitorAvatarUrl?: string;
  serviceName: string;
  lastMessage: string;
  lastMessageAt: string;
  messages: ChatMessage[];
};

type BrowserGlobals = {
  atob?: (value: string) => string;
  document?: {
    cookie?: string;
  };
};

type ExpoGlobals = {
  process?: {
    env?: {
      EXPO_PUBLIC_VENDOR_ID?: string;
    };
  };
};

type ChatSearchParams = Record<string, string | string[] | undefined>;

const toText = (value: unknown, fallback = "") =>
  typeof value === "string" && value.trim() ? value : fallback;

const paramToText = (value: string | string[] | undefined) =>
  Array.isArray(value) ? toText(value[0]) : toText(value);

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "C";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

function ChatAvatar({
  name,
  imageUrl,
  size = 48,
}: {
  name: string;
  imageUrl?: string;
  size?: number;
}) {
  const { isDark } = useAppTheme();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(imageUrl && failedUrl !== imageUrl);

  const containerStyle = [
    styles.avatar,
    isDark && {
      backgroundColor: "rgba(252, 123, 84, 0.15)",
      borderColor: "rgba(252, 123, 84, 0.3)",
    },
    size !== 48 ? { width: size, height: size, borderRadius: size / 2 } : null,
  ];

  if (showImage && imageUrl) {
    return (
      <View style={containerStyle}>
        <Image
          source={{ uri: imageUrl }}
          style={styles.avatarImage}
          resizeMode="cover"
          onError={() => setFailedUrl(imageUrl)}
        />
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <Text
        style={[
          styles.avatarText,
          size !== 48 ? { fontSize: Math.round(size * 0.35) } : null,
        ]}
      >
        {getInitials(name)}
      </Text>
    </View>
  );
}

async function graphQlRequest<TData>(
  query: string,
  variables: Record<string, unknown>,
): Promise<TData> {
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

  let payload: { data?: TData; errors?: { message?: string }[] } = {};
  try {
    payload = (await response.json()) as {
      data?: TData;
      errors?: { message?: string }[];
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
}

const readVendorIdFromCookie = () => {
  const browserGlobals = globalThis as BrowserGlobals;
  const cookie = browserGlobals.document?.cookie;
  const decodeBase64 = browserGlobals.atob;
  if (!cookie || typeof decodeBase64 !== "function") return "";

  const tokenPair = cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("access_tokenVendor="));

  if (!tokenPair) return "";
  const token = tokenPair.slice("access_tokenVendor=".length);
  const jwtParts = token.split(".");
  if (jwtParts.length < 2) return "";

  try {
    const payload = JSON.parse(
      decodeBase64(jwtParts[1].replace(/-/g, "+").replace(/_/g, "/")),
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
    getVendorChats?: {
      chatId?: string;
      visitorId?: string;
      serviceId?: string;
      updatedAt?: string;
      messages?: {
        id?: string;
        content?: string;
        senderId?: string;
        senderType?: string;
        timestamp?: string;
      }[];
    }[];
  }>(
    `
      query GetVendorChats($vendorId: String!) {
        getVendorChats(vendorId: $vendorId) {
          chatId
          visitorId
          serviceId
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
      serviceId: toText(item.serviceId),
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
      messages?: {
        id?: string;
        content?: string;
        senderId?: string;
        senderType?: string;
        timestamp?: string;
      }[];
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

const markChatAsRead = async (
  chatId: string,
  userId: string,
): Promise<void> => {
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
          profile_pic_url
        }
      }
    `,
    { id },
  );

  return data.findVisitorById || {};
};

const loadServiceNameById = async (id: string): Promise<string> => {
  const data = await graphQlRequest<{
    findServiceById?: { name?: string } | null;
  }>(
    `
      query FindServiceByIdForChats($id: String!) {
        findServiceById(id: $id) {
          name
        }
      }
    `,
    { id },
  );

  return toText(data.findServiceById?.name, "Service");
};

const isSameDay = (d1: string, d2: string) => {
  if (!d1 || !d2) return false;
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  if (Number.isNaN(date1.getTime()) || Number.isNaN(date2.getTime()))
    return false;
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

const formatMessageTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

const formatChatDateHeader = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return "Yesterday";

  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays > 0 && diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: "long" });
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatTimeAgo = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return "Yesterday";

  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays > 0 && diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }

  return date.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  });
};

export default function ChatScreen() {
  const { colors, isDark } = useAppTheme();
  const router = useRouter();
  const vendorSession = getVendorSession();
  const sessionEmail = vendorSession.email || "";
  const params = useGlobalSearchParams() as ChatSearchParams;

  const [rows, setRows] = useState<ChatRow[]>([]);
  const [loading, setLoading] = useState(true);
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
  const messagesScrollRef = useRef<ScrollView>(null);
  const fallbackVendorId = toText(
    (globalThis as ExpoGlobals).process?.env?.EXPO_PUBLIC_VENDOR_ID,
  );

  const vendorId =
    paramToText(params.vendor_id) ||
    paramToText(params.vendorId) ||
    paramToText(params.id) ||
    vendorSession.vendorId ||
    fallbackVendorId ||
    "";
  const vendorEmail =
    paramToText(params.vendor_email) ||
    paramToText(params.email) ||
    sessionEmail ||
    "";
  const paramChatId = paramToText(params.chatId);

  const handleBackToChatList = useCallback(() => {
    setActiveChatId("");
    if (paramChatId) {
      router.setParams({ chatId: "" });
    }
  }, [paramChatId, router]);

  // When vendor is inside a chat, phone back button returns to the main chat list
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (activeChatId) {
          handleBackToChatList();
          return true; // handled: returns to main chat list
        }
        return false; // let tab navigation handle it (e.g. goes back to Dashboard)
      };

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress,
      );
      return () => subscription.remove();
    }, [activeChatId, handleBackToChatList]),
  );

  const loadData = useCallback(async () => {
    setErrorMessage("");
    try {
      const resolvedVendorId =
        vendorId ||
        (await loadVendorIdByEmail(vendorEmail)) ||
        readVendorIdFromCookie();

      if (!resolvedVendorId) {
        throw new Error("Could not resolve vendor id for chats.");
      }

      setVendorSession({
        vendorId: resolvedVendorId,
        email: vendorEmail || sessionEmail,
      });
      setResolvedVendorId(resolvedVendorId);

      const chats = await loadVendorChats(resolvedVendorId);

      const visitorIds = [
        ...new Set(chats.map((chat) => chat.visitorId).filter(Boolean)),
      ];
      const serviceIds = [
        ...new Set(chats.map((chat) => chat.serviceId).filter(Boolean)),
      ];

      const [visitorEntries, serviceEntries] = await Promise.all([
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
          serviceIds.map(async (id) => {
            try {
              return [id, await loadServiceNameById(id)] as const;
            } catch {
              return [id, "Service"] as const;
            }
          }),
        ),
      ]);

      const visitorMap = new Map<string, VisitorDetails>(visitorEntries);
      const serviceMap = new Map<string, string>(serviceEntries);

      const normalizedRows = chats.map((chat) => {
        const visitor = visitorMap.get(chat.visitorId) || {};
        const visitorName = formatCoupleName(
          {
            visitor_fname: toText(visitor.visitor_fname),
            partner_fname: toText(visitor.partner_fname),
          },
          "Client",
        );
        const lastMessage = chat.messages[chat.messages.length - 1];

        return {
          chatId: chat.chatId,
          visitorName,
          visitorEmail: toText(visitor.email),
          visitorAvatarUrl: toText(visitor.profile_pic_url),
          serviceName: serviceMap.get(chat.serviceId) || "Service",
          lastMessage: toText(lastMessage?.content, "No messages yet"),
          lastMessageAt: toText(lastMessage?.timestamp || chat.updatedAt),
          messages: chat.messages,
        };
      });

      normalizedRows.sort((a, b) => {
        const aDate = new Date(a.lastMessageAt).getTime();
        const bDate = new Date(b.lastMessageAt).getTime();
        return (
          (Number.isNaN(bDate) ? 0 : bDate) - (Number.isNaN(aDate) ? 0 : aDate)
        );
      });

      setRows(normalizedRows);
    } catch (error) {
      setRows([]);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load chats right now.",
      );
    } finally {
      setLoading(false);
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
    if (!paramChatId) return;
    if (!rows.some((row) => row.chatId === paramChatId)) return;
    setActiveChatId(paramChatId);
  }, [paramChatId, rows]);

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
        socket.emit("joinChat", {
          chatId: row.chatId,
          userId: resolvedVendorId,
        });
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
        messages?: {
          id?: string;
          content?: string;
          senderId?: string;
          senderType?: string;
          timestamp?: string;
        }[];
      };
    }) => {
      const chatId = toText(payload.chatId);
      if (!chatId) return;

      const socketMessages = Array.isArray(payload.chat?.messages)
        ? payload.chat.messages
        : [];
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
            timestamp: toText(
              payload.message.timestamp,
              new Date().toISOString(),
            ),
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
              ? row.messages.some(
                  (msg) => msg.id && msg.id === fallbackMessage.id,
                )
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
          return (
            (Number.isNaN(bDate) ? 0 : bDate) -
            (Number.isNaN(aDate) ? 0 : aDate)
          );
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
      const updatedMessages = await sendVendorMessage(
        activeChatId,
        trimmed,
        senderVendorId,
      );
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
          return (
            (Number.isNaN(bDate) ? 0 : bDate) -
            (Number.isNaN(aDate) ? 0 : aDate)
          );
        });
      });
      setReplyText("");
    } catch (error) {
      setSendError(
        error instanceof Error ? error.message : "Unable to send message.",
      );
    } finally {
      setSending(false);
    }
  }, [activeChatId, replyText, sending, vendorId]);

  const content = useMemo(() => {
    if (loading) {
      return <ChatSkeleton />;
    }

    if (errorMessage) {
      return (
        <View
          style={[
            styles.centerState,
            styles.errorCard,
            isDark && {
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              borderColor: "rgba(239, 68, 68, 0.3)",
            },
          ]}
        >
          <Text style={[styles.errorTitle, isDark && { color: "#F87171" }]}>
            Unable to load vendor chats
          </Text>
          <Text style={[styles.errorText, isDark && { color: "#FCA5A5" }]}>
            {errorMessage}
          </Text>
        </View>
      );
    }

    if (!rows.length) {
      return (
        <View style={styles.centerState}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            No conversations yet
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
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
          <View style={styles.chatHeaderRow}>
            <Pressable
              style={({ pressed }) => [
                styles.backButton,
                { backgroundColor: colors.card, borderColor: colors.border },
                pressed && [
                  styles.backButtonPressed,
                  { backgroundColor: colors.cardSubtle },
                ],
              ]}
              onPress={handleBackToChatList}
              hitSlop={8}
            >
              <ArrowLeft size={20} color={colors.text} />
            </Pressable>
            <View
              style={[
                styles.chatHeader,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <ChatAvatar
                name={activeChat.visitorName}
                imageUrl={activeChat.visitorAvatarUrl}
              />
              <View style={styles.chatHeaderContent}>
                <Text
                  style={[styles.chatTitle, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {activeChat.visitorName}
                </Text>
                <View
                  style={[
                    styles.serviceBadge,
                    isDark && {
                      backgroundColor: "rgba(252, 123, 84, 0.15)",
                      borderColor: "rgba(252, 123, 84, 0.3)",
                    },
                  ]}
                >
                  <Text style={styles.serviceBadgeText} numberOfLines={1}>
                    {activeChat.serviceName}
                  </Text>
                </View>
              </View>
            </View>
          </View>
          <ScrollView
            ref={messagesScrollRef}
            style={styles.messagesScroll}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() =>
              messagesScrollRef.current?.scrollToEnd({ animated: false })
            }
          >
            {activeChat.messages.length ? (
              activeChat.messages.map((message, index) => {
                const mine = message.senderType.toLowerCase() === "vendor";
                const prevMessage =
                  index > 0 ? activeChat.messages[index - 1] : null;
                const showDateHeader =
                  index === 0 ||
                  !isSameDay(prevMessage?.timestamp || "", message.timestamp);
                const timeText = formatMessageTime(message.timestamp);

                return (
                  <View
                    key={`${message.id || message.timestamp || "msg"}-${index}`}
                  >
                    {showDateHeader && (
                      <View
                        style={[
                          styles.dateSeparator,
                          {
                            backgroundColor: colors.card,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.dateSeparatorText,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {formatChatDateHeader(message.timestamp)}
                        </Text>
                      </View>
                    )}
                    <View
                      style={[
                        styles.messageBubble,
                        mine
                          ? styles.myMessageBubble
                          : [
                              styles.otherMessageBubble,
                              {
                                backgroundColor: colors.card,
                                borderColor: colors.border,
                              },
                            ],
                      ]}
                    >
                      <Text
                        style={
                          mine
                            ? styles.myMessageText
                            : [styles.otherMessageText, { color: colors.text }]
                        }
                      >
                        {toText(message.content, "...")}
                      </Text>
                      {!!timeText && (
                        <Text
                          style={
                            mine
                              ? styles.myMessageTime
                              : [
                                  styles.otherMessageTime,
                                  { color: colors.textSecondary },
                                ]
                          }
                        >
                          {timeText}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })
            ) : (
              <Text
                style={[styles.emptySubtitle, { color: colors.textSecondary }]}
              >
                No messages in this chat yet.
              </Text>
            )}
          </ScrollView>
          <View style={styles.replyBar}>
            <TextInput
              placeholder="Type your reply..."
              placeholderTextColor={isDark ? "#64748B" : "#9CA3AF"}
              value={replyText}
              onChangeText={setReplyText}
              style={[
                styles.replyInput,
                {
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
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
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Send size={15} color="#FFFFFF" />
              )}
            </Pressable>
          </View>
          {!!sendError && <Text style={styles.sendErrorText}>{sendError}</Text>}
        </KeyboardAvoidingView>
      );
    }

    return (
      <View style={styles.list}>
        {rows.map((row) => {
          const lastMsg = row.messages?.[row.messages.length - 1];
          const isFromVendor = lastMsg?.senderType?.toLowerCase() === "vendor";

          return (
            <Pressable
              key={row.chatId}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
                pressed && [
                  styles.cardPressed,
                  {
                    backgroundColor: isDark ? colors.cardSubtle : "#FFF9F6",
                    borderColor: colors.primary,
                  },
                ],
              ]}
              onPress={() => setActiveChatId(row.chatId)}
            >
              <ChatAvatar
                name={row.visitorName}
                imageUrl={row.visitorAvatarUrl}
              />

              <View style={styles.cardContent}>
                <View style={styles.rowHeader}>
                  <Text
                    style={[styles.clientName, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {row.visitorName}
                  </Text>
                  <Text style={[styles.time, { color: colors.textSecondary }]}>
                    {formatTimeAgo(row.lastMessageAt)}
                  </Text>
                </View>

                <View style={styles.metaRow}>
                  <View
                    style={[
                      styles.serviceBadge,
                      isDark && {
                        backgroundColor: "rgba(252, 123, 84, 0.15)",
                        borderColor: "rgba(252, 123, 84, 0.3)",
                      },
                    ]}
                  >
                    <Text style={styles.serviceBadgeText} numberOfLines={1}>
                      {row.serviceName}
                    </Text>
                  </View>
                  {!!row.visitorEmail && (
                    <View style={styles.emailContainer}>
                      <Mail size={11} color={isDark ? "#64748B" : "#9CA3AF"} />
                      <Text
                        style={[styles.email, { color: colors.textSecondary }]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {row.visitorEmail}
                      </Text>
                    </View>
                  )}
                </View>

                <Text
                  style={[
                    styles.messagePreview,
                    { color: colors.textSecondary },
                    !row.lastMessage && styles.messagePreviewEmpty,
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {isFromVendor ? (
                    <Text
                      style={[
                        styles.messagePreviewSender,
                        { color: colors.text },
                      ]}
                    >
                      You:{" "}
                    </Text>
                  ) : null}
                  {row.lastMessage || "No messages yet"}
                </Text>
              </View>

              <View style={styles.chevronContainer}>
                <ChevronRight
                  size={18}
                  color={isDark ? "#64748B" : "#D1D5DB"}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  }, [
    activeChat,
    colors,
    errorMessage,
    handleSendReply,
    isDark,
    loading,
    replyText,
    rows,
    sendError,
    sending,
  ]);

  if (activeChat) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.container, styles.chatScreenContainer]}>
          {content}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.text }]}>
          Vendor Chats
        </Text>
        <Text style={[styles.pageSubtitle, { color: colors.textSecondary }]}>
          Messages with couples and clients
        </Text>
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
  chatScreenContainer: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 14 : 16,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 92 : 16,
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
    flex: 1,
    gap: 10,
  },
  chatHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 2,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  backButtonPressed: {
    opacity: 0.7,
    backgroundColor: "#F3F4F6",
  },
  chatHeader: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  chatHeaderContent: {
    flex: 1,
    gap: 3,
  },
  chatTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 17,
    color: "#111827",
  },
  chatSubtitle: {
    marginTop: 4,
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: "#FC7B54",
  },
  messagesScroll: {
    flex: 1,
  },
  messagesList: {
    flexGrow: 1,
    gap: 8,
    paddingVertical: 4,
    paddingBottom: 8,
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
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
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
  dateSeparator: {
    alignSelf: "center",
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 3.5,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  dateSeparatorText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 11,
    color: "#6B7280",
    letterSpacing: 0.2,
  },
  myMessageTime: {
    alignSelf: "flex-end",
    marginTop: 3,
    fontFamily: "Montserrat_500Medium",
    fontSize: 10,
    color: "rgba(255, 255, 255, 0.8)",
  },
  otherMessageTime: {
    alignSelf: "flex-end",
    marginTop: 3,
    fontFamily: "Montserrat_500Medium",
    fontSize: 10,
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
    minHeight: 44,
    maxHeight: 110,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
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
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
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
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 104,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardPressed: {
    borderColor: "#FC7B54",
    backgroundColor: "#FFF9F6",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFF3EE",
    borderWidth: 1.5,
    borderColor: "#FFD2C2",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
    color: "#FC7B54",
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 3,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  clientName: {
    flex: 1,
    fontFamily: "Outfit_700Bold",
    fontSize: 15.5,
    color: "#111827",
  },
  time: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 11.5,
    color: "#9CA3AF",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 6,
    height: 22,
    marginTop: 1,
    marginBottom: 2,
    overflow: "hidden",
  },
  serviceBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#FFF3EE",
    borderWidth: 1,
    borderColor: "#FFD2C2",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    maxWidth: "50%",
  },
  serviceBadgeText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 10.5,
    color: "#FC7B54",
    letterSpacing: 0.2,
  },
  emailContainer: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 3.5,
  },
  email: {
    flex: 1,
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: "#6B7280",
  },
  messagePreview: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    lineHeight: 18,
    color: "#4B5563",
  },
  messagePreviewSender: {
    fontFamily: "Montserrat_600SemiBold",
    color: "#1F2937",
  },
  messagePreviewEmpty: {
    color: "#9CA3AF",
    fontStyle: "italic",
  },
  chevronContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 2,
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
