export const AI_PROPOSAL_TYPES = [
  "CREATE_TASK",
  "LOG_INTERACTION",
  "CHANGE_LEAD_STATUS",
  "CREATE_QUOTATION_DRAFT",
] as const;

export type AiProposalType = (typeof AI_PROPOSAL_TYPES)[number];

export interface AssistantSource {
  label: string;
  href: string;
}

export interface AssistantProposalDTO {
  id: string;
  type: string;
  summary: string;
  status: string;
  expiresAt: string;
}

export interface AssistantRunDTO {
  conversationId: string;
  answer: string;
  sources: AssistantSource[];
  proposals: AssistantProposalDTO[];
}

export interface AssistantConversationDTO {
  id: string;
  messages: Array<{
    id: string;
    role: "USER" | "ASSISTANT";
    content: string;
    createdAt: string;
  }>;
}
