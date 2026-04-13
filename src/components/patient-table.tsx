import { PatientSummaryDrawer } from "./patient-summary-drawer";
import {
  DataTable,
  ColumnFilterConfig,
  TableHeaderContent,
  TableCellContent,
  useTableUiState,
  SimplePagination,
  Button,
} from "@/components/ui";
import {
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import type { PatientRow } from "@/api/types";
import { useState, useCallback, useEffect } from "react";
import { useSearchParams, Link, useNavigate } from "react-router";
import { api } from "@/api/client";
import { searchParamsToGetPatientsFilter, paramsToObject } from "@/lib/utils";

const columns: ColumnDef<PatientRow>[] = [
  {
    accessorKey: "firstname",
    header: () => <TableHeaderContent content={"First name"} />,
    cell: ({ cell }) => (
      <TableCellContent content={cell.getValue() as string} />
    ),
    enablePinning: true,
    enableResizing: true,
    enableSorting: true,
  },
  {
    accessorKey: "lastname",
    header: () => <TableHeaderContent content={"Last name"} />,
    cell: ({ cell }) => (
      <TableCellContent content={cell.getValue() as string} />
    ),
    enablePinning: true,
    enableResizing: true,
    enableSorting: true,
  },
  {
    accessorKey: "id",
    header: () => <TableHeaderContent content={"ID"} />,
    cell: ({ cell }) => (
      <TableCellContent content={cell.getValue() as string} />
    ),
    enablePinning: true,
    enableResizing: true,
  },
  {
    accessorKey: "birthdate",
    header: () => <TableHeaderContent content={"Birth"} />,
    cell: ({ cell }) => (
      <TableCellContent content={cell.getValue() as string} />
    ),
    enablePinning: true,
    enableResizing: true,
    enableSorting: true,
    minSize: 120,
  },
  {
    accessorKey: "phonenumber",
    header: () => <TableHeaderContent content={"Phone number"} />,
    cell: ({ cell }) => (
      <TableCellContent content={cell.getValue() as string} />
    ),
    enablePinning: true,
    enableResizing: true,
    enableSorting: true,
  },
  {
    accessorKey: "email",
    header: () => <TableHeaderContent content={"Email"} />,
    cell: ({ cell }) => (
      <TableCellContent content={cell.getValue() as string} />
    ),
    enablePinning: true,
    enableResizing: true,
    enableSorting: true,
  },
  {
    accessorKey: "gender",
    header: () => <TableHeaderContent content={"Gender"} />,
    cell: ({ cell }) => (
      <TableCellContent content={cell.getValue() as string} />
    ),
    enablePinning: true,
    enableResizing: true,
  },
  {
    accessorKey: "street",
    header: () => <TableHeaderContent content={"Street"} />,
    cell: ({ cell }) => (
      <TableCellContent content={cell.getValue() as string} />
    ),
    enablePinning: true,
    enableResizing: true,
  },
  {
    accessorKey: "city",
    header: () => <TableHeaderContent content={"City"} />,
    cell: ({ cell }) => (
      <TableCellContent content={cell.getValue() as string} />
    ),
    enablePinning: true,
    enableResizing: true,
  },
  {
    accessorKey: "state",
    header: () => <TableHeaderContent content={"State"} />,
    cell: ({ cell }) => (
      <TableCellContent content={cell.getValue() as string} />
    ),
    enablePinning: true,
    enableResizing: true,
  },
  {
    accessorKey: "zip",
    header: () => <TableHeaderContent content={"ZIP"} />,
    cell: ({ cell }) => (
      <TableCellContent content={cell.getValue() as string} />
    ),
    enablePinning: true,
    enableResizing: true,
  },
  {
    accessorKey: "country",
    header: () => <TableHeaderContent content={"Country"} />,
    cell: ({ cell }) => (
      <TableCellContent content={cell.getValue() as string} />
    ),
    enablePinning: true,
    enableResizing: true,
  },
  {
    accessorKey: "encounters",
    header: () => <TableHeaderContent content={"Encounters"} />,
    cell: ({ cell }) => (
      <TableCellContent content={cell.getValue() as number} />
    ),
    enablePinning: true,
    enableResizing: true,
  },
  {
    id: "actions",
    header: () => <TableHeaderContent content={"Actions"} />,
    cell: ({ row }) => (
      <TableCellContent
        content={
          <Link
            to={`/patients/${row.original.id}`}
            className="text-blue-600 hover:text-blue-800"
            onClick={(e) => e.stopPropagation()}
          >
            Match
          </Link>
        }
      />
    ),
    enablePinning: true,
    enableResizing: true,
  },
];

const LOCALSTORAGE_KEY = "patient-table-ui-state";

export function PatientTable() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<PatientRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientRow | null>(
    null
  );

  const params = paramsToObject(searchParams);
  const filters = searchParamsToGetPatientsFilter(params);
  const page = parseInt((params.page as string) || "1");
  const count = parseInt((params.count as string) || "20");
  const sortBy = params.sortBy as string | undefined;
  const sortDir = params.sortDir as string | undefined;

  const { uiState: initialUiState, handleUiChange } = useTableUiState(
    LOCALSTORAGE_KEY,
    {
      columnOrder: [],
      columnPinning: {},
      columnSizing: {},
      columnVisibility: {},
      drawerWidth: 0.4,
    }
  );

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await api.getPatients({
        page,
        count,
        filter: filters,
        sortDir,
        sortBy,
      });
      setData(result.items);
    } catch (e) {
      console.error("Failed to load patients", e);
    } finally {
      setIsLoading(false);
    }
  }, [searchParams.toString()]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Restore pagination from localStorage on first mount
  useEffect(() => {
    if (initialUiState?.pagination) {
      const urlPage = searchParams.get("page");
      const urlCount = searchParams.get("count");
      if ((!urlPage && !urlCount) || (urlPage === "1" && urlCount === "10")) {
        const savedPage = initialUiState.pagination.pageIndex + 1;
        const savedCount = initialUiState.pagination.pageSize;
        if (savedPage !== 1 || savedCount !== 10) {
          setSearchParams((prev) => {
            prev.set("page", savedPage.toString());
            prev.set("count", savedCount.toString());
            return prev;
          });
        }
      }
    }
  }, []);

  const filterConfig: ColumnFilterConfig = [
    {
      enabled: true,
      columnId: "firstname",
      type: "text",
      placeholder: "Search",
      value: filters.firstName,
    },
    {
      enabled: true,
      columnId: "lastname",
      type: "text",
      placeholder: "Search",
      value: filters.lastName,
    },
    {
      enabled: true,
      columnId: "id",
      type: "text",
      placeholder: "Search",
      value: filters.id,
    },
    {
      enabled: true,
      columnId: "birthdate",
      type: "date",
      placeholder: "Pick date",
      value: filters.birthdate ? new Date(filters.birthdate) : undefined,
    },
    {
      enabled: true,
      columnId: "phonenumber",
      type: "text",
      placeholder: "Search",
      value: filters.phone,
    },
    {
      enabled: true,
      columnId: "email",
      type: "text",
      placeholder: "Search",
      value: filters.email,
    },
    {
      enabled: true,
      columnId: "encounters",
      type: "text",
      placeholder: "Search",
    },
  ];

  const updateFilter = (columnFilters: ColumnFiltersState) => {
    const next = new URLSearchParams();
    columnFilters.forEach((f) => next.set(f.id, String(f.value)));
    next.set("page", "1");
    next.set("count", "10");
    setSearchParams(next);
  };

  const fetchPatients = (pagination: PaginationState) => {
    setSearchParams((prev) => {
      prev.set("page", pagination.pageIndex.toString());
      prev.set("count", pagination.pageSize.toString());
      return prev;
    });
  };

  const sort = (sorting: SortingState) => {
    setSearchParams((prev) => {
      if (sorting.length === 0) {
        prev.delete("sortBy");
        prev.delete("sortDir");
      } else {
        prev.set("sortBy", sorting[0].id);
        prev.set("sortDir", sorting[0].desc ? "desc" : "asc");
      }
      return prev;
    });
  };

  return (
    <PatientSummaryDrawer
      patientId={selectedPatient?.id}
      firstName={selectedPatient?.firstname}
      lastName={selectedPatient?.lastname}
      selectedPatient={!!selectedPatient}
      setSelectedPatient={setSelectedPatient}
      defaultWidth={initialUiState?.drawerWidth}
      onWidthChange={(w) =>
        initialUiState && handleUiChange({ ...initialUiState, drawerWidth: w })
      }
      footerChildren={
        selectedPatient && (
          <Button className="w-auto" asChild>
            <Link to={`/patients/${selectedPatient.id}`}>Match</Link>
          </Button>
        )
      }
    >
      {initialUiState && (
        <DataTable
          columns={columns}
          data={data}
          isLoading={isLoading}
          pageSize={count}
          pageIndex={page - 1}
          onFilter={updateFilter}
          onCellClick={(row, columnId) => {
            if (columnId === "actions") navigate(`/patients/${row.id}`);
            else setSelectedPatient(row);
          }}
          onPaginationChange={fetchPatients}
          onSort={sort}
          filterConfig={filterConfig}
          sortingConfig={
            sortBy
              ? [{ id: sortBy, desc: sortDir === "desc" }]
              : []
          }
          showZebraStripes={true}
          enableColumnReordering={true}
          onUiChange={handleUiChange}
          initialUiState={initialUiState}
          paginationComponent={SimplePagination}
          searchButton={(btnFilters) => (
            <Button onClick={() => updateFilter(btnFilters)}>Search</Button>
          )}
        />
      )}
    </PatientSummaryDrawer>
  );
}
