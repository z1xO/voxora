import { PracticeApp } from "@/components/PracticeApp";

export default async function PracticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PracticeApp problemId={id} />;
}
