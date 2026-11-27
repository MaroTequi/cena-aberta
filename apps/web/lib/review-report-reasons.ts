export const reviewReportReasons = {
  spoiler: "Spoiler sem aviso",
  harassment: "Assédio ou ataque pessoal",
  hate: "Discurso de ódio ou discriminação",
  spam: "Spam ou publicidade",
  inappropriate: "Conteúdo impróprio",
  off_topic: "Conteúdo sem relação com a obra",
  other: "Outro motivo",
} as const;

export type ReviewReportReason = keyof typeof reviewReportReasons;
