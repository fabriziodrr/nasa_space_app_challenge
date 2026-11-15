import { ReactionTest } from "@/components/reaction-test/ReactionTest";

export const metadata = { title: "Reaction test | Onboard assistant" };

export default function ReactionDemoPage() {
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}><ReactionTest /></main>;
}
