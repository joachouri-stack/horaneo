import { TestimonialsEditor } from "@/components/editors/TestimonialsEditor";
import { withTenant } from "@/db/access";
import { managerPage } from "@/lib/manager/page";
import { listTestimonials } from "@/modules/content/testimonials";
import { deleteTestimonialAction, saveTestimonialAction } from "../../actions";

export default async function ManagerTestimonialsPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/site/temoignages">) {
  const page = await managerPage(params);
  const items = await withTenant(page.tenantId, (tx) => listTestimonials(tx, page.tenantId));
  return (
    <TestimonialsEditor
      tenantId={page.tenantId}
      contentLocale={page.tenant.defaultLocale}
      available={Boolean(page.tenant.features.testimonials)}
      items={items}
      actions={{ save: saveTestimonialAction, remove: deleteTestimonialAction }}
    />
  );
}
