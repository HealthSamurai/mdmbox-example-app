import { MdmBreadcrumbs, MdmBreadcrumbItem } from "./breadcrumbs";

export type NavbarProps = {
  breadcrumbItems: MdmBreadcrumbItem[];
  logoSrc?: string;
  children?: React.ReactNode;
};

export function MdmNavbar({
  breadcrumbItems,
  logoSrc = "/icons/aidbox-logo.svg",
  children,
}: NavbarProps) {
  return (
    <div className="flex-none h-15 flex items-center border-b">
      <div className="h-full shrink-0 border-r flex items-center justify-center w-[3.125rem] box-content">
        <img src={logoSrc} alt="Logo" className="h-6 w-6" />
      </div>
      <div className="pl-4 pr-5 w-full flex items-center justify-between">
        <MdmBreadcrumbs items={breadcrumbItems} />
        {children}
      </div>
    </div>
  );
}
