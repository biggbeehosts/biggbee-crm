import type { KnowledgeBaseRecord } from "@/types";

const HOMEPAGE = `Biggbee AI -- Every business deserves an AI workforce.

Biggbee is a UK-based premium AI agency specializing in custom AI employees for businesses. We design, build and deploy AI agents that integrate with existing teams to handle telecommunications, lead qualification, and workflow automation.

Services: AI Voice Agents, AI Receptionists, Lead Generation Agents, Real Estate AI Agents, Customer Support Agents, Appointment Setting Agents, Dental Receptionist Agents, Custom AI Agents.

Results: 85% reduction in missed calls. 3x faster lead response times. 40% increase in booked appointments. Handle 10x volume without hiring.

Process: Step 1 -- initial consultation identifying AI impact opportunities. Step 2 -- custom build plus a 7-day free trial. Step 3 -- live deployment.

Demo Agents: live, interactive agent demos are available for Voice, Receptionist, Lead Generation, Real Estate and Dental Receptionist use cases -- see the Demo Agents section of this homepage.

Contact: office@biggbees.com | +44 7932 327982 | Book a Strategy Call.`;

const ABOUT = `About Biggbee -- founded in 2023. Origin story: most service businesses lose more revenue from missed calls and slow follow-ups than they ever do from competition. First deployment was a voice agent for a dental clinic, achieving an 85% reduction in missed calls and 40% booking growth within one month.

Mission: Building the AI workforce of modern business.

Core values: Trust by default. Bias for outcomes. Human at the core. Craft over hype.`;

const REVIEWS = `Reviews are collected via a submission form covering Voice Agents, Receptionists, Lead Generation, Customer Support, Appointment Setting and Custom AI Agents. Reviews are moderated and appear on the site once approved.`;

const BLOG = `Blog: articles on AI receptionist ROI, how missed calls cost service businesses revenue, and case studies from early dental and real estate deployments.`;

export const MOCK_KNOWLEDGE_BASE: KnowledgeBaseRecord = {
  cacheKey: "latest",
  knowledgeBaseText: [HOMEPAGE, ABOUT, REVIEWS, BLOG].join("\n\n"),
  updatedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  sourceCount: 4,
  sections: [
    { title: "Homepage", content: HOMEPAGE },
    { title: "About", content: ABOUT },
    { title: "Reviews", content: REVIEWS },
    { title: "Blog", content: BLOG },
    {
      title: "Demo Agents",
      content:
        "Demo Agents are presented as a section of the Homepage above (biggbees.com has no standalone Demo Agents URL) -- refer to the Homepage section for demo-agent descriptions.",
    },
  ],
};
