import { TestimonialsEditor } from "@/components/editors/TestimonialsEditor";
import { managerPage } from "@/lib/manager/page";
import { SharedContentNotice } from "@/components/manager/SharedContentNotice";
import { listTestimonials } from "@/modules/content/testimonials";
import { deleteTestimonialAction, saveTestimonialAction } from "../../actions";

export default async function ManagerTestimonialsPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/site/temoignages">) {
  const page = await managerPage(params);
  // Avis communs au site : modifiés depuis l'entreprise principale seulement.
  if (!page.business.isPrimary) return <SharedContentNotice />;
  const items = await page.db((tx) => listTestimonials(tx, page.tenantId));
  return (
    <TestimonialsEditor
      tenantId={page.tenantId}
      contentLocale={page.tenant.defaultLocale}
      available={Boolean(page.tenant.features.testimonials)}
      items={items}
      headingLevel={1}
      actions={{ save: saveTestimonialAction, remove: deleteTestimonialAction }}
    />
  );
}
