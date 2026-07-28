export interface AssistantNotificationDTO {
  id: string;
  kind: "DAILY_BRIEF" | "TASK_DUE" | "QUOTATION_EXPIRING" | "ACTION_COMPLETED";
  title: string;
  body: string;
  href: string;
  readAt: string | null;
  createdAt: string;
}

export interface AssistantNotificationListDTO {
  items: AssistantNotificationDTO[];
  unreadCount: number;
}
