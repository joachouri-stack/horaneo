import { TestimonialsEditor } from "@/components/editors/TestimonialsEditor";
import { adminQuery } from "@/lib/admin/mutation";
import { loadTenantOverview } from "@/lib/admin/tenant";
import { listTestimonials } from "@/modules/content/testimonials";
import { deleteTestimonialAction, saveTestimonialAction } from "../../actions";

/** Témoignages d'un client (espace admin). */
export default async function TestimonialsPage({
  params,
}: PageProps<"/[locale]/admin/clients/[tenantId]/temoignages">) {
  const { tenantId } = await params;
  const [overview, items] = await Promise.all([
    loadTenantOverview(tenantId),
    adminQuery((tx) => listTestimonials(tx, tenantId)),
  ]);
  return (
    <TestimonialsEditor
      tenantId={tenantId}
      contentLocale={overview.tenant.defaultLocale}
      available={Boolean(overview.plan.features.testimonials)}
      items={items}
      actions={{ save: saveTestimonialAction, remove: deleteTestimonialAction }}
    />
  );
}
