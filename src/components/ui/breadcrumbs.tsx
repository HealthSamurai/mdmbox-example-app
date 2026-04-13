import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator
} from "@health-samurai/react-components";
import React from "react";

export interface MdmBreadcrumbItem {
    title: string;
    link?: string;
}

export interface MdmBreadcrumbsProps {
    items: MdmBreadcrumbItem[];
}

export function MdmBreadcrumbs({ items }: MdmBreadcrumbsProps) {
    return (
        <Breadcrumb>
            <BreadcrumbList>
                {items.map((crumb, index) => (
                    <React.Fragment key={crumb.title}>
                        {index > 0 && <BreadcrumbSeparator>/</BreadcrumbSeparator>}
                        <BreadcrumbItem>
                            {index === items.length - 1 ? (
                                <BreadcrumbPage style={{color: '#1D2331', fontSize: "20px"}}>{crumb.title}</BreadcrumbPage>
                            ) : (
                                crumb.link ? <BreadcrumbLink asChild style={{ backgroundColor: '#F4F5F6' }}>
                                    <a href={crumb.link}>{crumb.title}</a>
                                </BreadcrumbLink> : <BreadcrumbPage>{crumb.title}</BreadcrumbPage>
                            )}
                        </BreadcrumbItem>
                    </React.Fragment>
                ))}
            </BreadcrumbList>
        </Breadcrumb>
    );
}