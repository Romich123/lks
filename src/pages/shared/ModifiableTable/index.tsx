import React, { memo, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import styles from "./index.module.css"
import { alertsContext } from "../alerts/AlertsProvider"
import { Popup } from "../Popup"

type LegacyColumnType = "string" | "number" | "date" | "boolean" | string[]

export type ColumnDef<T> = {
    key: keyof T
    name: string
    noEdit?: boolean
    noCreate?: boolean
    className?: string
    visible?: boolean
    type?: LegacyColumnType
}

export type ActionColumnDef<T> = {
    key: string
    name: string
    className?: string
    visible?: boolean
    render: (row: T, index: number) => React.ReactNode
}

export type PersistedActionColumnDef = {
    key: string
    visible?: boolean
}

export type ModifiableTableLayout<T> = {
    columns: ColumnDef<T>[]
    actionColumns: PersistedActionColumnDef[]
    columnOrder: string[]
}

export type SortRule<T> = {
    dataKey: keyof T
    ascending: boolean
}

type FilterState = {
    contains: string
    equals: string
    isEmpty: boolean
    numberMin: string
    numberMax: string
    dateFrom: string
    dateTo: string
    booleanMode: "any" | "true" | "false"
}

type TableProps<T extends Record<string, any>> = {
    rowData: T[]
    columns: ColumnDef<T>[]
    actionColumns?: ActionColumnDef<T>[]
    initialColumnOrder?: string[]
    defaultSort?: SortRule<T> | SortRule<T>[]
    onCreate?: (newRow: Omit<T, "id">) => void | Promise<void>
    onDelete?: (row: T) => void | Promise<void>
    onEdit?: (row: T) => void | Promise<void>
    onColumnsChange?: (columns: ColumnDef<T>[]) => void
    onLayoutChange?: (layout: ModifiableTableLayout<T>) => void
    allowEdit?: boolean
    className?: string
    getRowId?: (row: T, index: number) => string | number
    creatingRowDefaults?: Partial<T>
    startWithCreatingRow?: boolean
    onCreationCancel?: () => void
}

type EditInputProps = {
    col: ColumnDef<any>
    value: any
    onChange: (val: any) => void
    inputKey: string
}

type HeaderMenuState<T> = {
    columnId: string
    anchor: HTMLElement
}

type ManagedColumn<T> = { id: string; kind: "data"; column: ColumnDef<T> } | { id: string; kind: "action"; column: ActionColumnDef<T>; visible: boolean }

function getDataColumnId<T>(columnKey: keyof T) {
    return `data:${String(columnKey)}`
}

function getActionColumnId(columnKey: string) {
    return `action:${columnKey}`
}

const defaultFilterState = (): FilterState => ({
    contains: "",
    equals: "",
    isEmpty: false,
    numberMin: "",
    numberMax: "",
    dateFrom: "",
    dateTo: "",
    booleanMode: "any",
})

function isEmptyValue(value: unknown) {
    return value === null || value === undefined || value === ""
}

function getLegacyColumnKind(type: LegacyColumnType | undefined): "number" | "boolean" | "date" | "enum" | "string" | null {
    if (Array.isArray(type)) return "enum"
    if (type === "number" || type === "boolean" || type === "date" || type === "string") return type
    return null
}

function coerceBoolean(value: unknown): boolean | null {
    if (typeof value === "boolean") return value
    if (typeof value === "number") {
        if (value === 1) return true
        if (value === 0) return false
        return null
    }
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase()
        if (["true", "1", "yes", "y", "да"].includes(normalized)) return true
        if (["false", "0", "no", "n", "нет"].includes(normalized)) return false
    }
    return null
}

function toNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : null
    }
    return null
}

function toTimestamp(value: unknown): number | null {
    if (value instanceof Date) {
        const time = value.getTime()
        return Number.isNaN(time) ? null : time
    }
    if (typeof value === "string" && value.trim() !== "") {
        const time = Date.parse(value)
        return Number.isNaN(time) ? null : time
    }
    if (typeof value === "number" && Number.isFinite(value)) return value
    return null
}

function parseValue(value: any, type: LegacyColumnType | undefined): any {
    const kind = getLegacyColumnKind(type)

    if (kind === "enum") return value
    if (kind === "number") return Number(value) || 0
    if (kind === "boolean") return Boolean(value)
    if (kind === "date") return value

    if (typeof value === "string") {
        const trimmed = value.trim()
        const boolValue = coerceBoolean(trimmed)
        if (boolValue !== null) return boolValue

        const numericValue = toNumber(trimmed)
        if (numericValue !== null && trimmed !== "") return numericValue
    }

    return value
}

function renderCreationInput(col: ColumnDef<any>, value: any, onChange: (val: any) => void, key: string) {
    if (Array.isArray(col.type)) {
        return (
            <select key={key} className={styles.newRowInput} value={(value as string) || ""} onChange={(e) => onChange(e.target.value)}>
                {col.type.map((opt) => (
                    <option key={opt} value={opt}>
                        {opt}
                    </option>
                ))}
            </select>
        )
    }

    return <input key={key} type="text" className={styles.newRowInput} placeholder={col.name} value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} />
}

function validateCreationData<T>(creatingData: Partial<T>, columns: ColumnDef<T>[], showAlert: (message: string, options?: any) => void): boolean {
    const errors: string[] = []

    for (const col of columns) {
        if (col.noCreate) continue

        const kind = getLegacyColumnKind(col.type)
        const value = String(creatingData[col.key] ?? "")

        if (kind === "number" && value.trim() !== "" && toNumber(value) === null) {
            errors.push(`"${col.name}" должно быть числом`)
        }

        if (kind === "date" && value.trim() !== "" && toTimestamp(value) === null) {
            errors.push(`"${col.name}" должно быть датой`)
        }

        if (kind === "boolean" && value.trim() !== "" && coerceBoolean(value) === null) {
            errors.push(`"${col.name}" должно быть true/false`)
        }
    }

    if (errors.length > 0) {
        showAlert(errors.join(";\n"), { type: "warning" })
        return false
    }

    return true
}

function isFilterActive(filter: FilterState | undefined) {
    if (!filter) return false

    return (
        filter.contains.trim() !== "" ||
        filter.equals.trim() !== "" ||
        filter.isEmpty ||
        filter.numberMin.trim() !== "" ||
        filter.numberMax.trim() !== "" ||
        filter.dateFrom.trim() !== "" ||
        filter.dateTo.trim() !== "" ||
        filter.booleanMode !== "any"
    )
}

function rowMatchesFilter(value: unknown, filter: FilterState | undefined) {
    if (!isFilterActive(filter)) return true

    const current = filter!

    if (current.isEmpty && !isEmptyValue(value)) return false
    if (!current.isEmpty && isEmptyValue(value) && isFilterActive({ ...current, isEmpty: false })) return false

    if (current.contains.trim() !== "") {
        const haystack = String(value ?? "").toLowerCase()
        if (!haystack.includes(current.contains.trim().toLowerCase())) return false
    }

    if (current.equals.trim() !== "") {
        if (String(value ?? "") !== current.equals) return false
    }

    if (current.booleanMode !== "any") {
        const boolValue = coerceBoolean(value)
        if (boolValue === null) return false
        if (String(boolValue) !== current.booleanMode) return false
    }

    if (current.numberMin.trim() !== "" || current.numberMax.trim() !== "") {
        const numericValue = toNumber(value)
        if (numericValue === null) return false

        const min = current.numberMin.trim() === "" ? null : Number(current.numberMin)
        const max = current.numberMax.trim() === "" ? null : Number(current.numberMax)

        if (min !== null && (!Number.isFinite(min) || numericValue < min)) return false
        if (max !== null && (!Number.isFinite(max) || numericValue > max)) return false
    }

    if (current.dateFrom.trim() !== "" || current.dateTo.trim() !== "") {
        const timestamp = toTimestamp(value)
        if (timestamp === null) return false

        const from = current.dateFrom.trim() === "" ? null : toTimestamp(current.dateFrom)
        const to = current.dateTo.trim() === "" ? null : toTimestamp(current.dateTo)

        if (from === null && current.dateFrom.trim() !== "") return false
        if (to === null && current.dateTo.trim() !== "") return false
        if (from !== null && timestamp < from) return false
        if (to !== null && timestamp > to + 24 * 60 * 60 * 1000 - 1) return false
    }

    return true
}

function comparePrimitiveValues(a: unknown, b: unknown) {
    if (a === b) return 0

    if (isEmptyValue(a) && isEmptyValue(b)) return 0
    if (isEmptyValue(a)) return 1
    if (isEmptyValue(b)) return -1

    const numberA = toNumber(a)
    const numberB = toNumber(b)
    if (numberA !== null && numberB !== null) return numberA - numberB

    const booleanA = coerceBoolean(a)
    const booleanB = coerceBoolean(b)
    if (booleanA !== null && booleanB !== null) return Number(booleanA) - Number(booleanB)

    const dateA = toTimestamp(a)
    const dateB = toTimestamp(b)
    if (dateA !== null && dateB !== null) return dateA - dateB

    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" })
}

const IconSprites = memo(function IconSprites() {
    return createPortal(
        <div style={{ display: "none" }}>
            <svg id="plus-svg" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
                <path fillRule="evenodd" d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2" />
            </svg>
            <svg id="trash-svg" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
                <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z" />
                <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z" />
            </svg>
            <svg id="edit-svg" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
                <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325" />
            </svg>
            <svg id="check-svg" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
                <path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425z" />
            </svg>
            <svg id="x-svg" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708" />
            </svg>
            <svg id="arrow-up-svg" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
                <path fillRule="evenodd" d="M8 15a.5.5 0 0 0 .5-.5V2.707l3.146 3.147a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 1 0 .708.708L7.5 2.707V14.5a.5.5 0 0 0 .5.5z" />
            </svg>
        </div>,
        document.body,
    )
})

function EditInput({ col, value, onChange, inputKey }: EditInputProps) {
    const baseClass = styles.editRowInput

    if (Array.isArray(col.type)) {
        return (
            <select key={inputKey} className={baseClass} value={(value as string) || ""} onChange={(e) => onChange(e.target.value)}>
                {col.type.map((opt) => (
                    <option key={opt} value={opt}>
                        {opt}
                    </option>
                ))}
            </select>
        )
    }

    if (typeof value === "boolean") {
        return <input key={inputKey} type="checkbox" className={baseClass} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
    }

    if (typeof value === "number") {
        return <input key={inputKey} type="number" className={baseClass} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(e.target.value)} />
    }

    return <input key={inputKey} type="text" className={baseClass} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
}

interface TableRowProps<T> {
    row: T
    index: number
    columns: ManagedColumn<T>[]
    allowEdit: boolean
    isEditing: boolean
    editingData: Partial<T>
    onEdit: ((row: T) => void | Promise<void>) | undefined
    onDelete: ((row: T) => void | Promise<void>) | undefined
    onStartCreating: (index: number) => void
    onStartEditing: (row: T, rowId: string | number) => void
    onCancelEdit: () => void
    onSubmitEdit: (row: T) => void
    onEditDataChange: (key: keyof T, val: any) => void
    getRowId: (row: T, index: number) => string | number
}

function TableRow<T extends Record<string, any>>({
    row,
    index,
    columns,
    allowEdit,
    isEditing,
    editingData,
    onEdit,
    onDelete,
    onStartCreating,
    onStartEditing,
    onCancelEdit,
    onSubmitEdit,
    onEditDataChange,
    getRowId,
}: TableRowProps<T>) {
    const rowId = getRowId(row, index)

    return (
        <tr className={`${styles.hiddenMenuRow} ${isEditing ? styles.editRow : ""}`}>
            {columns.map((managedColumn) => {
                if (managedColumn.kind === "action") {
                    return (
                        <td key={managedColumn.id} className={managedColumn.column.className}>
                            {managedColumn.column.render(row, index)}
                        </td>
                    )
                }

                const col = managedColumn.column
                return (
                    <td key={managedColumn.id} className={col.className}>
                        {isEditing && !col.noEdit ? (
                            <EditInput col={col} value={editingData[col.key]} onChange={(val) => onEditDataChange(col.key, val)} inputKey={`edit-${String(col.key)}-${rowId}`} />
                        ) : (
                            String(row[col.key] ?? "")
                        )}
                    </td>
                )
            })}
            {allowEdit && (
                <td className={styles.hiddenMenuCell}>
                    {isEditing ? (
                        <>
                            <button type="button" onClick={() => onSubmitEdit(row)} title="Сохранить">
                                <svg color="lightgreen">
                                    <use href="#check-svg"></use>
                                </svg>
                            </button>
                            <button type="button" onClick={onCancelEdit} title="Отмена">
                                <svg color="rgb(255, 100, 100)">
                                    <use href="#x-svg"></use>
                                </svg>
                            </button>
                        </>
                    ) : (
                        <>
                            <button type="button" onClick={() => onStartCreating(index)} title="Вставить строку ниже">
                                <svg color="lightgreen">
                                    <use href="#plus-svg"></use>
                                </svg>
                            </button>
                            {onDelete && (
                                <button type="button" onClick={() => onDelete(row)} title="Удалить строку">
                                    <svg color="rgb(255, 66, 66)">
                                        <use href="#trash-svg"></use>
                                    </svg>
                                </button>
                            )}
                            {onEdit && (
                                <button type="button" onClick={() => onStartEditing(row, rowId)} title="Редактировать строку">
                                    <svg color="white">
                                        <use href="#edit-svg"></use>
                                    </svg>
                                </button>
                            )}
                        </>
                    )}
                </td>
            )}
        </tr>
    )
}

interface CreationRowProps<T> {
    columns: ManagedColumn<T>[]
    creatingData: Partial<T>
    onDataChange: (key: keyof T, val: any) => void
    onSubmit: () => void
    onCancel: () => void
}

function CreationRow<T extends Record<string, any>>({ columns, creatingData, onDataChange, onSubmit, onCancel }: CreationRowProps<T>) {
    return (
        <tr className={styles.newRow}>
            {columns.map((managedColumn) => {
                if (managedColumn.kind === "action") {
                    return <td key={managedColumn.id} className={managedColumn.column.className}></td>
                }

                const col = managedColumn.column
                return (
                    <td key={managedColumn.id} className={col.className}>
                        {!col.noCreate && renderCreationInput(col, creatingData[col.key], (val) => onDataChange(col.key, val), `create-${String(col.key)}`)}
                    </td>
                )
            })}
            <td className={styles.creationActionsCell}>
                <button type="button" onClick={onSubmit}>
                    Добавить
                </button>
                <button type="button" onClick={onCancel}>
                    Отмена
                </button>
            </td>
        </tr>
    )
}

interface BottomRowProps {
    onCreateNew: () => void
    columnLength: number
    topId: string
}

function BottomRow({ onCreateNew, columnLength, topId }: BottomRowProps) {
    return (
        <tr className={styles.bottomRow}>
            <td colSpan={columnLength} className={styles.bottomRowCell}>
                <div className={styles.bottomRowContent}>
                    <button type="button" onClick={onCreateNew} className={styles.bottomRowButton} title="Создать новую строку">
                        <svg color="lightgreen" className={styles.bottomRowIcon}>
                            <use href="#plus-svg"></use>
                        </svg>
                    </button>
                    <a href={"#" + topId} className={styles.bottomRowButton} title="Наверх">
                        <svg color="lightblue" className={styles.bottomRowIcon}>
                            <use href="#arrow-up-svg"></use>
                        </svg>
                    </a>
                </div>
            </td>
        </tr>
    )
}

type HeaderMenuProps<T extends Record<string, any>> = {
    column: ColumnDef<T>
    columns: ColumnDef<T>[]
    availableColumnKeys: string[]
    filter: FilterState
    menuState: HeaderMenuState<T>
    canManageColumns: boolean
    sortDirection: "asc" | "desc" | null
    onClose: () => void
    onFilterChange: (columnKey: keyof T, updater: (prev: FilterState) => FilterState) => void
    onToggleColumnVisibility: (columnKey: keyof T) => void
    onMoveColumn: (columnKey: keyof T, direction: -1 | 1) => void
    onAddColumn: (column: ColumnDef<T>) => void
}

function HeaderMenu<T extends Record<string, any>>({
    column,
    columns,
    availableColumnKeys,
    filter,
    menuState,
    canManageColumns,
    sortDirection,
    onClose,
    onFilterChange,
    onToggleColumnVisibility,
    onMoveColumn,
    onAddColumn,
}: HeaderMenuProps<T>) {
    const [newColumnKey, setNewColumnKey] = useState("")
    const [newColumnName, setNewColumnName] = useState("")

    const handleAddColumn = useCallback(() => {
        const key = newColumnKey.trim()
        if (!key) return

        onAddColumn({
            key: key as keyof T,
            name: newColumnName.trim() || key,
            visible: true,
        })
        setNewColumnKey("")
        setNewColumnName("")
    }, [newColumnKey, newColumnName, onAddColumn])

    return (
        <Popup anchor={menuState.anchor} onClose={onClose} className={styles.headerMenu}>
            <div className={styles.menuSection}>
                <div className={styles.menuTitleRow}>
                    <strong>{column.name}</strong>
                    <button type="button" className={styles.menuCloseButton} onClick={onClose} aria-label="Закрыть фильтры">
                        <svg>
                            <use href="#x-svg"></use>
                        </svg>
                    </button>
                </div>
                <div className={styles.menuStatusRow}>
                    <span>Сортировка: {sortDirection === "asc" ? "по возрастанию" : sortDirection === "desc" ? "по убыванию" : "выкл."}</span>
                    <span>Фильтр: {isFilterActive(filter) ? "вкл." : "выкл."}</span>
                </div>
            </div>

            <div className={styles.menuSection}>
                <label className={styles.menuField}>
                    <span>Содержит</span>
                    <input type="text" value={filter.contains} onChange={(e) => onFilterChange(column.key, (prev) => ({ ...prev, contains: e.target.value }))} />
                </label>
                <label className={styles.menuField}>
                    <span>Равно</span>
                    <input type="text" value={filter.equals} onChange={(e) => onFilterChange(column.key, (prev) => ({ ...prev, equals: e.target.value }))} />
                </label>
                <label className={styles.menuCheckbox}>
                    <input type="checkbox" checked={filter.isEmpty} onChange={(e) => onFilterChange(column.key, (prev) => ({ ...prev, isEmpty: e.target.checked }))} />
                    <span>Только пустые значения</span>
                </label>
            </div>

            <div className={styles.menuSection}>
                <div className={styles.menuSectionTitle}>Числовой диапазон</div>
                <div className={styles.menuRangeFields}>
                    <label className={styles.menuField}>
                        <span>От</span>
                        <input type="number" value={filter.numberMin} onChange={(e) => onFilterChange(column.key, (prev) => ({ ...prev, numberMin: e.target.value }))} />
                    </label>
                    <label className={styles.menuField}>
                        <span>До</span>
                        <input type="number" value={filter.numberMax} onChange={(e) => onFilterChange(column.key, (prev) => ({ ...prev, numberMax: e.target.value }))} />
                    </label>
                </div>
            </div>

            <div className={styles.menuSection}>
                <div className={styles.menuSectionTitle}>Диапазон дат</div>
                <div className={styles.menuRangeFields}>
                    <label className={styles.menuField}>
                        <span>С</span>
                        <input type="date" value={filter.dateFrom} onChange={(e) => onFilterChange(column.key, (prev) => ({ ...prev, dateFrom: e.target.value }))} />
                    </label>
                    <label className={styles.menuField}>
                        <span>По</span>
                        <input type="date" value={filter.dateTo} onChange={(e) => onFilterChange(column.key, (prev) => ({ ...prev, dateTo: e.target.value }))} />
                    </label>
                </div>
            </div>

            <div className={styles.menuSection}>
                <div className={styles.menuSectionTitle}>Булево значение</div>
                <select value={filter.booleanMode} onChange={(e) => onFilterChange(column.key, (prev) => ({ ...prev, booleanMode: e.target.value as FilterState["booleanMode"] }))}>
                    <option value="any">Любое</option>
                    <option value="true">Да</option>
                    <option value="false">Нет</option>
                </select>
            </div>

            <div className={styles.menuSection}>
                <button type="button" className={styles.secondaryButton} onClick={() => onFilterChange(column.key, () => defaultFilterState())}>
                    Сбросить фильтр
                </button>
            </div>

            {false && canManageColumns && (
                <>
                    <div className={styles.menuSection}>
                        <div className={styles.menuSectionTitle}>Столбцы</div>
                        <div className={styles.menuActionsRow}>
                            <button type="button" className={styles.secondaryButton} onClick={() => onMoveColumn(column.key, -1)}>
                                Сдвинуть влево
                            </button>
                            <button type="button" className={styles.secondaryButton} onClick={() => onMoveColumn(column.key, 1)}>
                                Сдвинуть вправо
                            </button>
                            <button type="button" className={styles.secondaryButton} onClick={() => onToggleColumnVisibility(column.key)}>
                                {column.visible === false ? "Показать столбец" : "Скрыть столбец"}
                            </button>
                        </div>
                    </div>

                    <div className={styles.menuSection}>
                        <div className={styles.menuSectionTitle}>Все столбцы</div>
                        <div className={styles.columnToggleList}>
                            {columns.map((item) => (
                                <label key={String(item.key)} className={styles.menuCheckbox}>
                                    <input type="checkbox" checked={item.visible !== false} onChange={() => onToggleColumnVisibility(item.key)} />
                                    <span>{item.name}</span>
                                </label>
                            ))}
                            {availableColumnKeys.map((key) => (
                                <label key={key} className={styles.menuCheckbox}>
                                    <input type="checkbox" checked={false} onChange={() => onToggleColumnVisibility(key as keyof T)} />
                                    <span>{key}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className={styles.menuSection}>
                        <div className={styles.menuSectionTitle}>Добавить столбец</div>
                        <div className={styles.menuRangeFields}>
                            <label className={styles.menuField}>
                                <span>Key</span>
                                <input type="text" value={newColumnKey} onChange={(e) => setNewColumnKey(e.target.value)} />
                            </label>
                            <label className={styles.menuField}>
                                <span>Название</span>
                                <input type="text" value={newColumnName} onChange={(e) => setNewColumnName(e.target.value)} />
                            </label>
                        </div>
                        <button type="button" className={styles.secondaryButton} onClick={handleAddColumn} disabled={!newColumnKey.trim()}>
                            Добавить новый столбец
                        </button>
                    </div>
                </>
            )}
        </Popup>
    )
}

type ManagedHeaderMenuProps<T extends Record<string, any>> = {
    column: ManagedColumn<T>
    columns: ManagedColumn<T>[]
    availableColumnKeys: string[]
    filter: FilterState | null
    menuState: HeaderMenuState<T>
    canManageColumns: boolean
    sortDirection: "asc" | "desc" | null
    onClose: () => void
    onFilterChange: (columnKey: keyof T, updater: (prev: FilterState) => FilterState) => void
    onToggleColumnVisibility: (columnId: string) => void
    onMoveColumn: (columnId: string, direction: -1 | 1) => void
    onAddColumn: (column: ColumnDef<T>) => void
}

function ManagedHeaderMenu<T extends Record<string, any>>({
    column,
    columns,
    availableColumnKeys,
    filter,
    menuState,
    canManageColumns,
    sortDirection,
    onClose,
    onFilterChange,
    onToggleColumnVisibility,
    onMoveColumn,
    onAddColumn,
}: ManagedHeaderMenuProps<T>) {
    if (column.kind === "data") {
        return (
            <HeaderMenu
                column={column.column}
                columns={columns.filter((item): item is Extract<ManagedColumn<T>, { kind: "data" }> => item.kind === "data").map((item) => item.column)}
                availableColumnKeys={availableColumnKeys}
                filter={filter ?? defaultFilterState()}
                menuState={menuState}
                canManageColumns={canManageColumns}
                sortDirection={sortDirection}
                onClose={onClose}
                onFilterChange={onFilterChange}
                onToggleColumnVisibility={(columnKey) => onToggleColumnVisibility(getDataColumnId(columnKey))}
                onMoveColumn={(columnKey, direction) => onMoveColumn(getDataColumnId(columnKey), direction)}
                onAddColumn={onAddColumn}
            />
        )
    }

    return (
        <Popup anchor={menuState.anchor} onClose={onClose} className={styles.headerMenu}>
            <div className={styles.menuSection}>
                <div className={styles.menuTitleRow}>
                    <strong>{column.column.name}</strong>
                    <button type="button" className={styles.menuCloseButton} onClick={onClose} aria-label="Закрыть меню">
                        <svg>
                            <use href="#x-svg"></use>
                        </svg>
                    </button>
                </div>
                <div className={styles.menuStatusRow}>
                    <span>Сортировка: недоступна</span>
                    <span>Фильтр: недоступен</span>
                </div>
            </div>

            {canManageColumns && (
                <>
                    <div className={styles.menuSection}>
                        <div className={styles.menuSectionTitle}>Столбцы</div>
                        <div className={styles.menuActionsRow}>
                            <button type="button" className={styles.secondaryButton} onClick={() => onMoveColumn(column.id, -1)}>
                                Сдвинуть влево
                            </button>
                            <button type="button" className={styles.secondaryButton} onClick={() => onMoveColumn(column.id, 1)}>
                                Сдвинуть вправо
                            </button>
                            <button type="button" className={styles.secondaryButton} onClick={() => onToggleColumnVisibility(column.id)}>
                                {column.visible === false ? "Показать столбец" : "Скрыть столбец"}
                            </button>
                        </div>
                    </div>

                    <div className={styles.menuSection}>
                        <div className={styles.menuSectionTitle}>Все столбцы</div>
                        <div className={styles.columnToggleList}>
                            {columns.map((item) => (
                                <label key={item.id} className={styles.menuCheckbox}>
                                    <input type="checkbox" checked={item.kind === "data" ? item.column.visible !== false : item.visible !== false} onChange={() => onToggleColumnVisibility(item.id)} />
                                    <span>{item.column.name}</span>
                                </label>
                            ))}
                            {availableColumnKeys.map((key) => (
                                <label key={key} className={styles.menuCheckbox}>
                                    <input type="checkbox" checked={false} onChange={() => onToggleColumnVisibility(getDataColumnId(key as keyof T))} />
                                    <span>{key}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className={styles.menuSection}>
                        <div className={styles.menuSectionTitle}>Добавить столбец</div>
                        <div className={styles.menuRangeFields}>
                            <label className={styles.menuField}>
                                <span>Key</span>
                                <input type="text" onChange={() => undefined} value="" disabled />
                            </label>
                            <label className={styles.menuField}>
                                <span>Название</span>
                                <input type="text" onChange={() => undefined} value="" disabled />
                            </label>
                        </div>
                        <button type="button" className={styles.secondaryButton} onClick={() => onAddColumn({ key: "" as keyof T, name: "", visible: true })} disabled>
                            Добавить новый столбец
                        </button>
                    </div>
                </>
            )}
        </Popup>
    )
}

type ColumnManagerMenuProps<T extends Record<string, any>> = {
    columns: ManagedColumn<T>[]
    availableColumnKeys: string[]
    anchor: HTMLElement
    onClose: () => void
    onToggleColumnVisibility: (columnId: string) => void
    onMoveColumn: (columnId: string, direction: -1 | 1) => void
    onAddColumn: (column: ColumnDef<T>) => void
}

function ColumnManagerMenu<T extends Record<string, any>>({ columns, availableColumnKeys, anchor, onClose, onToggleColumnVisibility, onMoveColumn, onAddColumn }: ColumnManagerMenuProps<T>) {
    const [newColumnKey, setNewColumnKey] = useState("")
    const [newColumnName, setNewColumnName] = useState("")

    const handleAddColumn = useCallback(() => {
        const key = newColumnKey.trim()
        if (!key) return

        onAddColumn({
            key: key as keyof T,
            name: newColumnName.trim() || key,
            visible: true,
        })
        setNewColumnKey("")
        setNewColumnName("")
    }, [newColumnKey, newColumnName, onAddColumn])

    return (
        <Popup anchor={anchor} onClose={onClose} className={styles.headerMenu}>
            <div className={styles.menuSection}>
                <div className={styles.menuTitleRow}>
                    <strong>Управление столбцами</strong>
                    <button type="button" className={styles.menuCloseButton} onClick={onClose}>
                        <svg>
                            <use href="#x-svg"></use>
                        </svg>
                    </button>
                </div>
            </div>

            <div className={styles.menuSection}>
                <div className={styles.menuSectionTitle}>Все столбцы</div>
                <div className={styles.columnManagerList}>
                    {columns.map((item, index) => {
                        const visible = item.kind === "data" ? item.column.visible !== false : item.visible !== false

                        return (
                            <div key={item.id} className={styles.columnManagerRow}>
                                <label className={styles.menuCheckbox}>
                                    <input type="checkbox" checked={visible} onChange={() => onToggleColumnVisibility(item.id)} />
                                    <span>{item.column.name}</span>
                                </label>
                                <div className={styles.columnManagerActions}>
                                    <button type="button" className={styles.secondaryButton} onClick={() => onMoveColumn(item.id, -1)} disabled={index === 0}>
                                        Влево
                                    </button>
                                    <button type="button" className={styles.secondaryButton} onClick={() => onMoveColumn(item.id, 1)} disabled={index === columns.length - 1}>
                                        Вправо
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                    {availableColumnKeys.map((key) => (
                        <label key={key} className={styles.menuCheckbox}>
                            <input type="checkbox" checked={false} onChange={() => onToggleColumnVisibility(getDataColumnId(key as keyof T))} />
                            <span>{key}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className={styles.menuSection}>
                <div className={styles.menuSectionTitle}></div>
                <div className={styles.menuRangeFields}>
                    <label className={styles.menuField}>
                        <span>Ключ</span>
                        <input type="text" value={newColumnKey} onChange={(e) => setNewColumnKey(e.target.value)} />
                    </label>
                    <label className={styles.menuField}>
                        <span>Название</span>
                        <input type="text" value={newColumnName} onChange={(e) => setNewColumnName(e.target.value)} />
                    </label>
                </div>
                <button type="button" className={styles.secondaryButton} onClick={handleAddColumn} disabled={!newColumnKey.trim()}>
                    Добавить столбец
                </button>
            </div>
        </Popup>
    )
}

export function ModifiableTable<T extends Record<string, any>>({
    rowData,
    columns,
    actionColumns = [],
    initialColumnOrder,
    defaultSort,
    onCreate,
    onDelete,
    onEdit,
    onColumnsChange,
    onLayoutChange,
    allowEdit = true,
    className,
    getRowId = (_, index) => index,
    creatingRowDefaults,
    startWithCreatingRow = false,
    onCreationCancel,
}: TableProps<T>) {
    const { showAlert } = useContext(alertsContext)
    const headId = useId()
    const [creatingAfterIndex, setCreatingAfterIndex] = useState<number>(-1)
    const [creatingData, setCreatingData] = useState<Partial<T>>(() => creatingRowDefaults ?? {})
    const [editingRowId, setEditingRowId] = useState<string | number | null>(null)
    const [editingData, setEditingData] = useState<Partial<T>>({})
    const [filters, setFilters] = useState<Partial<Record<string, FilterState>>>({})
    const [sortDirections, setSortDirections] = useState<Partial<Record<string, "asc" | "desc">>>(() => {
        if (!defaultSort) return {}

        const rules = Array.isArray(defaultSort) ? defaultSort : [defaultSort]
        return Object.fromEntries(rules.map((rule) => [String(rule.dataKey), rule.ascending ? "asc" : "desc"]))
    })
    const [headerMenu, setHeaderMenu] = useState<HeaderMenuState<T> | null>(null)
    const [columnManagerAnchor, setColumnManagerAnchor] = useState<HTMLElement | null>(null)
    const [columnOrder, setColumnOrder] = useState<string[]>(initialColumnOrder ?? [])
    const [actionColumnVisibility, setActionColumnVisibility] = useState<Record<string, boolean>>({})
    const onLayoutChangeRef = useRef(onLayoutChange)
    const lastLayoutRef = useRef<string | null>(null)

    useEffect(() => {
        onLayoutChangeRef.current = onLayoutChange
    }, [onLayoutChange])

    useEffect(() => {
        if (!initialColumnOrder) return

        setColumnOrder((prev) => {
            const next = [...initialColumnOrder]
            return next.length === prev.length && next.every((id, index) => id === prev[index]) ? prev : next
        })
    }, [initialColumnOrder])

    useEffect(() => {
        const nextIds = [...columns.map((column) => getDataColumnId(column.key)), ...actionColumns.map((column) => getActionColumnId(column.key))]
        setColumnOrder((prev) => {
            const preserved = prev.filter((id) => nextIds.includes(id))
            const missing = nextIds.filter((id) => !preserved.includes(id))
            const next = [...preserved, ...missing]
            return next.length === prev.length && next.every((id, index) => id === prev[index]) ? prev : next
        })
    }, [columns, actionColumns])

    useEffect(() => {
        setActionColumnVisibility((prev) => {
            const next: Record<string, boolean> = {}
            actionColumns.forEach((column) => {
                next[column.key] = prev[column.key] ?? column.visible !== false
            })
            const same = Object.keys(prev).length === Object.keys(next).length && Object.entries(next).every(([key, value]) => prev[key] === value)
            return same ? prev : next
        })
    }, [actionColumns])

    const managedColumns = useMemo<ManagedColumn<T>[]>(() => {
        const orderedIds = columnOrder.length > 0 ? columnOrder : [...columns.map((column) => getDataColumnId(column.key)), ...actionColumns.map((column) => getActionColumnId(column.key))]
        const dataById = new Map(columns.map((column) => [getDataColumnId(column.key), column]))
        const actionById = new Map(actionColumns.map((column) => [getActionColumnId(column.key), column]))
        const nextColumns: ManagedColumn<T>[] = []

        orderedIds.forEach((id) => {
            const dataColumn = dataById.get(id)
            if (dataColumn) {
                nextColumns.push({ id, kind: "data", column: dataColumn })
                return
            }

            const actionColumn = actionById.get(id)
            if (!actionColumn) return

            nextColumns.push({ id, kind: "action", column: actionColumn, visible: actionColumnVisibility[actionColumn.key] ?? actionColumn.visible !== false })
        })

        return nextColumns
    }, [actionColumnVisibility, actionColumns, columnOrder, columns])

    const visibleColumns = useMemo(() => columns.filter((column) => column.visible !== false), [columns])
    const visibleManagedColumns = useMemo<ManagedColumn<T>[]>(
        () => managedColumns.filter((column) => (column.kind === "data" ? column.column.visible !== false : column.visible !== false)),
        [managedColumns],
    )
    const visibleKeys = useMemo(() => new Set(visibleColumns.map((column) => String(column.key))), [visibleColumns])
    const availableColumnKeys = useMemo(() => {
        const existingKeys = new Set(columns.map((column) => String(column.key)))
        const discoveredKeys = new Set<string>()

        rowData.forEach((row) => {
            Object.keys(row).forEach((key) => {
                if (!existingKeys.has(key)) {
                    discoveredKeys.add(key)
                }
            })
        })

        return [...discoveredKeys].sort((a, b) => a.localeCompare(b))
    }, [columns, rowData])

    useEffect(() => {
        setSortDirections((prev) => {
            const next = Object.fromEntries(Object.entries(prev).filter(([key]) => visibleKeys.has(key))) as Partial<Record<string, "asc" | "desc">>
            return Object.keys(next).length === Object.keys(prev).length ? prev : next
        })

        setFilters((prev) => {
            const next = Object.fromEntries(Object.entries(prev).filter(([key]) => visibleKeys.has(key))) as Partial<Record<string, FilterState>>
            return Object.keys(next).length === Object.keys(prev).length ? prev : next
        })
    }, [visibleKeys])

    useEffect(() => {
        const nextLayout = {
            columns,
            actionColumns: actionColumns.map((column) => ({
                key: column.key,
                visible: actionColumnVisibility[column.key] ?? column.visible,
            })),
            columnOrder,
        } satisfies ModifiableTableLayout<T>
        const serializedLayout = JSON.stringify(nextLayout)

        if (serializedLayout === lastLayoutRef.current) return

        lastLayoutRef.current = serializedLayout
        onLayoutChangeRef.current?.(nextLayout)
    }, [actionColumnVisibility, actionColumns, columnOrder, columns])

    const orderedSortRules = useMemo(
        () =>
            visibleColumns
                .map((column) => {
                    const direction = sortDirections[String(column.key)]
                    if (!direction) return null
                    return { dataKey: column.key, ascending: direction === "asc" }
                })
                .filter((rule): rule is SortRule<T> => rule !== null),
        [visibleColumns, sortDirections],
    )

    const startCreating = useCallback(
        (index: number) => {
            const defaults: Partial<T> = {}

            visibleColumns.forEach((col) => {
                if (!col.noCreate) {
                    defaults[col.key] = (Array.isArray(col.type) ? col.type[0] || "" : "") as T[keyof T]
                }
            })

            setCreatingData({ ...defaults, ...creatingRowDefaults })
            setCreatingAfterIndex(index)
        },
        [creatingRowDefaults, visibleColumns],
    )

    const startEditing = useCallback(
        (row: T, rowId: string | number) => {
            const nextData: Partial<T> = {}

            visibleColumns.forEach((col) => {
                if (!col.noEdit) nextData[col.key] = row[col.key]
            })

            setEditingData(nextData)
            setEditingRowId(rowId)
        },
        [visibleColumns],
    )

    const cancelEditing = useCallback(() => {
        setEditingRowId(null)
        setEditingData({})
    }, [])

    const cancelCreating = useCallback(() => {
        setCreatingAfterIndex(-1)
        setCreatingData({})
        onCreationCancel?.()
    }, [onCreationCancel])

    const handleEditDataChange = useCallback((key: keyof T, val: any) => {
        setEditingData((prev) => ({ ...prev, [key]: val }))
    }, [])

    const handleCreatingDataChange = useCallback((key: keyof T, val: any) => {
        setCreatingData((prev) => ({ ...prev, [key]: val }))
    }, [])

    const handleCreateSubmit = useCallback(async () => {
        if (!onCreate) return
        if (!validateCreationData(creatingData, visibleColumns, showAlert)) return

        const processedData: any = {}
        visibleColumns.forEach((col) => {
            if (col.noCreate) return
            processedData[col.key] = parseValue(creatingData[col.key], col.type)
        })

        await onCreate(processedData as Omit<T, "id">)
        cancelCreating()
    }, [onCreate, creatingData, visibleColumns, showAlert, cancelCreating])

    const handleEditSubmit = useCallback(
        async (originalRow: T) => {
            if (!onEdit) return

            const processedData: any = { ...originalRow, ...editingData }
            visibleColumns.forEach((col) => {
                if (col.key in editingData) processedData[col.key] = parseValue(editingData[col.key], col.type)
            })

            await onEdit(processedData as T)
            cancelEditing()
        },
        [onEdit, editingData, visibleColumns, cancelEditing],
    )

    const handleCreateNew = useCallback(() => {
        startCreating((rowData.length || 1) - 1)
    }, [startCreating, rowData.length])

    useEffect(() => {
        if (!startWithCreatingRow) return
        if (creatingAfterIndex !== -1) return
        setCreatingData(creatingRowDefaults ?? {})
        setCreatingAfterIndex((rowData.length || 1) - 1)
    }, [creatingAfterIndex, creatingRowDefaults, rowData.length, startWithCreatingRow])

    const handleSortClick = useCallback((columnKey: keyof T) => {
        const key = String(columnKey)

        setSortDirections((prev) => {
            const current = prev[key]
            if (current === "asc") return { ...prev, [key]: "desc" }
            if (current === "desc") {
                const next = { ...prev }
                delete next[key]
                return next
            }
            return { ...prev, [key]: "asc" }
        })
    }, [])

    const handleOpenMenu = useCallback((columnId: string, element: HTMLElement) => {
        setColumnManagerAnchor(null)
        setHeaderMenu({
            columnId,
            anchor: element,
        })
    }, [])

    const handleOpenColumnManager = useCallback((element: HTMLElement) => {
        setHeaderMenu(null)
        setColumnManagerAnchor(element)
    }, [])

    const handleFilterChange = useCallback((columnKey: keyof T, updater: (prev: FilterState) => FilterState) => {
        setFilters((prev) => {
            const key = String(columnKey)
            const nextValue = updater(prev[key] ?? defaultFilterState())
            return { ...prev, [key]: nextValue }
        })
    }, [])

    const handleToggleColumnVisibility = useCallback(
        (columnId: string) => {
            if (columnId.startsWith("action:")) {
                const actionKey = columnId.slice("action:".length)
                const visibleCount = managedColumns.filter((column) => (column.kind === "data" ? column.column.visible !== false : column.visible !== false)).length
                const currentVisible = actionColumnVisibility[actionKey] ?? actionColumns.find((column) => column.key === actionKey)?.visible !== false

                if (currentVisible && visibleCount <= 1) {
                    showAlert("Нельзя скрыть все столбцы", { type: "warning" })
                    return
                }

                setActionColumnVisibility((prev) => ({ ...prev, [actionKey]: !currentVisible }))
                return
            }

            if (!onColumnsChange) return

            const columnKey = columnId.slice("data:".length) as keyof T
            const targetColumn = columns.find((column) => String(column.key) === String(columnKey))
            if (!targetColumn) {
                onColumnsChange([
                    ...columns,
                    {
                        key: columnKey,
                        name: String(columnKey),
                        visible: true,
                    },
                ])
                return
            }

            const visibleCount = managedColumns.filter((column) => (column.kind === "data" ? column.column.visible !== false : column.visible !== false)).length

            if (targetColumn.visible !== false && visibleCount <= 1) {
                showAlert("Нельзя скрыть все столбцы", { type: "warning" })
                return
            }

            onColumnsChange(
                columns.map((column) => {
                    if (String(column.key) !== String(columnKey)) return column
                    return { ...column, visible: column.visible === false ? true : false }
                }),
            )
        },
        [actionColumnVisibility, actionColumns, columns, managedColumns, onColumnsChange, showAlert],
    )

    const handleMoveColumn = useCallback(
        (columnId: string, direction: -1 | 1) => {
            const index = columnOrder.findIndex((id) => id === columnId)
            const targetIndex = index + direction
            if (index === -1 || targetIndex < 0 || targetIndex >= columnOrder.length) return

            const nextOrder = [...columnOrder]
            const current = nextOrder[index]
            const target = nextOrder[targetIndex]
            if (!current || !target) return
            ;[nextOrder[index], nextOrder[targetIndex]] = [target, current]
            setColumnOrder(nextOrder)

            if (!onColumnsChange) return

            const orderedDataKeys = nextOrder.filter((id) => id.startsWith("data:")).map((id) => id.slice("data:".length))
            const columnsByKey = new Map(columns.map((column) => [String(column.key), column]))
            onColumnsChange(orderedDataKeys.map((key) => columnsByKey.get(key)).filter((column): column is ColumnDef<T> => Boolean(column)))
        },
        [columnOrder, columns, onColumnsChange],
    )

    const handleAddColumn = useCallback(
        (newColumn: ColumnDef<T>) => {
            if (!onColumnsChange) return

            const key = String(newColumn.key).trim()
            if (!key) return
            if (columns.some((column) => String(column.key) === key)) return

            onColumnsChange([
                ...columns,
                {
                    ...newColumn,
                    key: key as keyof T,
                    name: newColumn.name?.trim() || key,
                    visible: newColumn.visible ?? true,
                },
            ])
        },
        [columns, onColumnsChange],
    )

    const filteredAndSortedData = useMemo(() => {
        const filtered = rowData.filter((row) => visibleColumns.every((column) => rowMatchesFilter(row[column.key], filters[String(column.key)])))

        if (orderedSortRules.length === 0) return filtered

        return [...filtered].sort((a, b) => {
            for (const rule of orderedSortRules) {
                const comparison = comparePrimitiveValues(a[rule.dataKey], b[rule.dataKey])
                if (comparison !== 0) return rule.ascending ? comparison : -comparison
            }

            return 0
        })
    }, [rowData, visibleColumns, filters, orderedSortRules])

    const currentMenuColumn = useMemo<ManagedColumn<T> | null>(() => {
        if (!headerMenu) return null
        return managedColumns.find((column) => column.id === headerMenu.columnId) ?? null
    }, [managedColumns, headerMenu])

    useEffect(() => {
        if (!headerMenu || !currentMenuColumn) return

        const isVisible = currentMenuColumn.kind === "data" ? currentMenuColumn.column.visible !== false : currentMenuColumn.visible !== false
        if (!isVisible) {
            setHeaderMenu(null)
        }
    }, [currentMenuColumn, headerMenu])

    useEffect(() => {
        if (!columnManagerAnchor) return
        if (typeof document !== "undefined" && !document.body.contains(columnManagerAnchor)) {
            setColumnManagerAnchor(null)
        }
    }, [columnManagerAnchor, managedColumns])

    return (
        <>
            <IconSprites />
            {currentMenuColumn && currentMenuColumn.kind === "data" && headerMenu && (
                <ManagedHeaderMenu
                    column={currentMenuColumn}
                    columns={managedColumns}
                    availableColumnKeys={availableColumnKeys}
                    filter={currentMenuColumn.kind === "data" ? (filters[String(currentMenuColumn.column.key)] ?? defaultFilterState()) : null}
                    menuState={headerMenu}
                    canManageColumns={Boolean(onColumnsChange) || actionColumns.length > 0}
                    sortDirection={currentMenuColumn.kind === "data" ? (sortDirections[String(currentMenuColumn.column.key)] ?? null) : null}
                    onClose={() => setHeaderMenu(null)}
                    onFilterChange={handleFilterChange}
                    onToggleColumnVisibility={handleToggleColumnVisibility}
                    onMoveColumn={handleMoveColumn}
                    onAddColumn={handleAddColumn}
                />
            )}
            {columnManagerAnchor && (Boolean(onColumnsChange) || actionColumns.length > 0) && (
                <ColumnManagerMenu
                    columns={managedColumns}
                    availableColumnKeys={availableColumnKeys}
                    anchor={columnManagerAnchor}
                    onClose={() => setColumnManagerAnchor(null)}
                    onToggleColumnVisibility={handleToggleColumnVisibility}
                    onMoveColumn={handleMoveColumn}
                    onAddColumn={handleAddColumn}
                />
            )}

            <div className={styles.tableControls}>
                {(Boolean(onColumnsChange) || actionColumns.length > 0) && (
                    <button
                        type="button"
                        className={styles.columnManagerButton}
                        data-open={columnManagerAnchor ? "true" : "false"}
                        aria-expanded={columnManagerAnchor ? "true" : "false"}
                        onClick={(event) => handleOpenColumnManager(event.currentTarget)}
                    >
                        Столбцы
                    </button>
                )}
            </div>

            <table className={`${styles.table} ${className || ""}`}>
                <thead id={headId}>
                    <tr>
                        {visibleManagedColumns.map((column) => {
                            if (column.kind === "action") {
                                return (
                                    <th title={column.column.name} key={column.id} className={column.column.className}>
                                        {column.column.name}
                                    </th>
                                )
                            }

                            const col = column.column
                            const isSorted = Boolean(sortDirections[String(col.key)])
                            const hasFilter = isFilterActive(filters[String(col.key)])

                            return (
                                <th
                                    title={col.name}
                                    key={column.id}
                                    className={`${col.className || ""} ${hasFilter ? styles.filteredHeader : ""}`}
                                    onClick={(event) => handleOpenMenu(column.id, event.currentTarget)}
                                    style={{ userSelect: "none" }}
                                >
                                    <div className={styles.tableColumnHead}>
                                        <span className={styles.tableColumnHeadText}>{col.name}</span>
                                        {hasFilter && <span className={styles.filterIndicator}>F</span>}
                                        <button
                                            type="button"
                                            className={`${styles.sortButton} ${isSorted ? styles.sortButtonActive : ""}`}
                                            data-sort-state={sortDirections[String(col.key)] ?? "none"}
                                            onClick={(event) => {
                                                event.stopPropagation()
                                                handleSortClick(col.key)
                                            }}
                                            title="Поменять сортировку"
                                        >
                                            <span className={styles.sortDirection}>
                                                {sortDirections[String(col.key)] === "asc" ? "По возрастанию" : sortDirections[String(col.key)] === "desc" ? "По убыванию" : "нет"}
                                            </span>
                                        </button>
                                    </div>
                                </th>
                            )
                        })}
                        {allowEdit && <th className={styles.actionsHeader}></th>}
                    </tr>
                </thead>
                <tbody>
                    {filteredAndSortedData.map((row, index) => {
                        const rowId = getRowId(row, index)

                        return (
                            <React.Fragment key={String(rowId)}>
                                <TableRow
                                    row={row}
                                    index={index}
                                    columns={visibleManagedColumns}
                                    allowEdit={allowEdit}
                                    isEditing={editingRowId === rowId}
                                    editingData={editingData}
                                    onEdit={onEdit}
                                    onDelete={onDelete}
                                    onStartCreating={startCreating}
                                    onStartEditing={startEditing}
                                    onCancelEdit={cancelEditing}
                                    onSubmitEdit={handleEditSubmit}
                                    onEditDataChange={handleEditDataChange}
                                    getRowId={getRowId}
                                />
                                {creatingAfterIndex === index && allowEdit && (
                                    <CreationRow
                                        columns={visibleManagedColumns}
                                        creatingData={creatingData}
                                        onDataChange={handleCreatingDataChange}
                                        onSubmit={handleCreateSubmit}
                                        onCancel={cancelCreating}
                                    />
                                )}
                            </React.Fragment>
                        )
                    })}
                    {rowData.length === 0 && creatingAfterIndex !== -1 && allowEdit && (
                        <CreationRow columns={visibleManagedColumns} creatingData={creatingData} onDataChange={handleCreatingDataChange} onSubmit={handleCreateSubmit} onCancel={cancelCreating} />
                    )}
                    <BottomRow onCreateNew={handleCreateNew} topId={headId} columnLength={visibleManagedColumns.length + (allowEdit ? 1 : 0)} />
                </tbody>
            </table>
        </>
    )
}
