import Layout from "@/components/layout";
import { MergesTable } from "@/components/merges-table";

export function MergesPage() {
  return (
    <Layout
      activeTab="merges"
      breadcrumbItems={[{ title: "Merges", link: "/merges" }]}
    >
      <MergesTable />
    </Layout>
  );
}
