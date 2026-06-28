import { PublicNavbar } from "@/components/layout/public-navbar";
import { SiteFooter } from "@/components/layout/footer";

export default function InstantHireLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicNavbar />
      {children}
      <SiteFooter />
    </>
  );
}
