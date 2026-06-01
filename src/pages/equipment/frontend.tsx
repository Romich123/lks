import { StrictMode, useContext, useEffect, useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Classroom } from "@/db/models/classroom"
import { Equipment as EquipmentModel } from "@/db/models/equipment"
import { PageLayout } from "../layout"
import { queryClient } from "../query"
import { alertsContext } from "../shared/alerts/AlertsProvider"
import { authContext } from "../shared/auth/AuthProvider"
import { ColumnDef, ModifiableTable } from "../shared/ModifiableTable"
import styles from "./index.module.css"
import "../global.css"

type EquipmentRow = EquipmentModel & {
    classroomName?: string
}

const elem = document.getElementById("root")!
const EQUIPMENT_COLUMNS_STORAGE_KEY = "equipment.table.columns"

function normalizeEquipmentPayload(equipment: Omit<EquipmentModel, "id"> | EquipmentRow): Omit<EquipmentModel, "id"> | EquipmentModel {
    return {
        ...equipment,
        currentClassroom: equipment.currentClassroom === "" ? null : equipment.currentClassroom,
    }
}

function toEquipmentPayload(equipment: EquipmentRow): EquipmentModel {
    const { classroomName, ...payload } = equipment
    return normalizeEquipmentPayload(payload) as EquipmentModel
}

function buildEquipmentColumns(classrooms: Classroom[]): ColumnDef<EquipmentRow>[] {
    return [
        { key: "name", name: "Название", visible: true },
        { key: "identifier", name: "Инвентарный номер", visible: true },
        {
            key: "currentClassroom",
            name: "Кабинет ID",
            visible: false,
            type: ["", ...classrooms.map((room) => String(room.id))],
        },
        { key: "classroomName", name: "Кабинет", visible: true, noEdit: true, noCreate: true },
    ]
}

function loadStoredColumns(defaultColumns: ColumnDef<EquipmentRow>[]): ColumnDef<EquipmentRow>[] {
    try {
        const raw = localStorage.getItem(EQUIPMENT_COLUMNS_STORAGE_KEY)
        if (!raw) return defaultColumns

        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return defaultColumns

        const defaultsByKey = new Map(defaultColumns.map((column) => [String(column.key), column]))
        const restoredColumns = parsed
            .filter((column): column is Partial<ColumnDef<EquipmentRow>> & { key: string } => typeof column === "object" && column !== null && typeof column.key === "string")
            .map((column) => {
                const defaultColumn = defaultsByKey.get(column.key)

                if (defaultColumn) {
                    return {
                        ...defaultColumn,
                        ...column,
                        key: defaultColumn.key,
                    }
                }

                return {
                    key: column.key as keyof EquipmentRow,
                    name: typeof column.name === "string" && column.name.trim() !== "" ? column.name : column.key,
                    visible: column.visible !== false,
                    noEdit: column.noEdit,
                    noCreate: column.noCreate,
                    type: column.type,
                }
            })

        const restoredKeys = new Set(restoredColumns.map((column) => String(column.key)))
        const missingDefaults = defaultColumns.filter((column) => !restoredKeys.has(String(column.key)))

        return [...restoredColumns, ...missingDefaults]
    } catch {
        return defaultColumns
    }
}

function App() {
    const { showAlert } = useContext(alertsContext)
    const { requestAdmin } = useContext(authContext)
    const { data: classroomData } = useQuery({
        queryKey: ["rooms"],
        queryFn: async () => {
            const response = await fetch("/api/classrooms/getAll")
            return await response.json()
        },
    })
    const { data: equipmentData } = useQuery({
        queryKey: ["equipment"],
        queryFn: async () => {
            const response = await fetch("/api/equipment/getAll")
            return await response.json()
        },
    })

    const defaultColumns = useMemo(() => buildEquipmentColumns((classroomData?.classrooms ?? []) as Classroom[]), [classroomData])
    const [columns, setColumns] = useState<ColumnDef<EquipmentRow>[]>(defaultColumns)

    useEffect(() => {
        setColumns(loadStoredColumns(defaultColumns))
    }, [defaultColumns])

    useEffect(() => {
        localStorage.setItem(EQUIPMENT_COLUMNS_STORAGE_KEY, JSON.stringify(columns))
    }, [columns])

    const deleteEquipment = useMutation({
        mutationFn: async (id: string | number) => {
            const [admin] = await requestAdmin()

            if (admin) {
                await fetch("/api/equipment/delete/" + id, {
                    method: "DELETE",
                }).catch((e) => {
                    showAlert(e.message, { type: "error" })
                })
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["equipment"] })
            queryClient.invalidateQueries({ queryKey: ["rooms"] })
        },
    })

    const createEquipment = useMutation({
        mutationFn: async (equipment: Omit<EquipmentModel, "id">) => {
            const [admin] = await requestAdmin()

            if (admin) {
                await fetch("/api/equipment/create", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(normalizeEquipmentPayload(equipment)),
                }).catch((e) => {
                    showAlert(e.message, { type: "error" })
                })
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["equipment"] })
            queryClient.invalidateQueries({ queryKey: ["rooms"] })
        },
    })

    const editEquipment = useMutation({
        mutationFn: async (equipment: EquipmentModel) => {
            const [admin] = await requestAdmin()

            if (admin) {
                await fetch("/api/equipment/edit", {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(toEquipmentPayload(equipment)),
                }).catch((e) => {
                    showAlert(e.message, { type: "error" })
                })
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["equipment"] })
            queryClient.invalidateQueries({ queryKey: ["rooms"] })
        },
    })

    if (!equipmentData || !classroomData) {
        return <div></div>
    }

    const classrooms = classroomData.classrooms as Classroom[]
    const classroomById = new Map(classrooms.map((room) => [room.id, room]))
    const equipmentRows = (equipmentData.equipment as EquipmentModel[]).map((item) => ({
        ...item,
        classroomName: item.currentClassroom === null ? "" : classroomById.get(item.currentClassroom)?.name ?? `#${item.currentClassroom}`,
    }))

    return (
        <div className={styles.equipmentTableWrapper}>
            <ModifiableTable
                rowData={equipmentRows}
                onCreate={(equipment) => {
                    createEquipment.mutate(normalizeEquipmentPayload(equipment as Omit<EquipmentModel, "id">))
                }}
                onDelete={(equipment) => {
                    deleteEquipment.mutate(equipment.id)
                }}
                onEdit={(equipment) => {
                    editEquipment.mutate(toEquipmentPayload(equipment))
                }}
                allowEdit={true}
                defaultSort={{ dataKey: "name", ascending: true }}
                columns={columns}
                onColumnsChange={setColumns}
            />
        </div>
    )
}

if (import.meta.hot) {
    const root = (import.meta.hot.data.root ??= createRoot(elem))
    root.render(
        <StrictMode>
            <PageLayout>
                <App />
            </PageLayout>
        </StrictMode>,
    )
} else {
    createRoot(elem).render(
        <StrictMode>
            <PageLayout>
                <App />
            </PageLayout>
        </StrictMode>,
    )
}
