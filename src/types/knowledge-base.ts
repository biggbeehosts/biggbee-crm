export interface KnowledgeBaseSection {
  title: string;
  content: string;
}

export interface KnowledgeBaseRecord {
  cacheKey?: string;
  knowledgeBaseText: string;
  updatedAt: string | null;
  sourceCount: number;
  sections: KnowledgeBaseSection[];
}
