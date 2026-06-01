import type Database from "better-sqlite3"
import { Result } from "./Result"

type Changes = Database.RunResult
type SQLiteError = Error
type DatabaseConnection = Database.Database

type ForwardTypeMap<T> = T extends string ? "TEXT" : T extends number ? "REAL" | "INTEGER" : T extends null ? "NULL" : T extends Uint8Array ? "BLOB" : never

type BackTypeMap = {
    NULL: null
    INTEGER: number
    REAL: number
    TEXT: string
    BLOB: NodeJS.TypedArray
}

type InferColumnType<T extends ColumnOptions<any>> = T extends { enum: (infer R)[] } ? (R extends BackTypeMap[T["type"]] ? R : BackTypeMap[T["type"]]) : BackTypeMap[T["type"]]

type InferColumnTypeNullable<T extends ColumnOptions<any>> = T extends { nullable: true } ? InferColumnType<T> | null : InferColumnType<T>

export type ColumnOptions<Enum extends any[] = any[]> = {
    nonStrict?: boolean
    unique?: boolean

    foreignKey?: { tableName: string; column: string }
    nullable?: boolean
} & (
    | {
          primaryKey?: false
          autoIncrement?: false
      }
    | {
          primaryKey: true
          autoIncrement?: boolean
      }
) &
    (
        | {
              type: "TEXT"
              default?: string
              readonly enum?: Enum
          }
        | {
              type: "INTEGER"
              default?: number
              readonly enum?: Enum
          }
        | {
              type: "REAL"
              default?: number
              readonly enum?: Enum
          }
        | {
              type: "BLOB"
              default?: NodeJS.TypedArray
          }
        | {
              type: "NULL"
              default?: null
          }
    )

export type TableBlueprint<T extends { [k: string]: any } = { [k: string]: any }> = {
    [columnName in keyof T]: ColumnOptions
}

export type BlueprintToReady<T extends TableBlueprint<any>> = {
    [columnName in keyof T]: T[columnName] extends { foreignKey: { tableName: string; column: string } } ? T[columnName] : T[columnName] & { foreignKey: { tableName: string; column: string } }
}

export type BlueprintToInstance<T extends TableBlueprint<any>> = {
    [columnName in keyof T]: InferColumnTypeNullable<T[columnName]>
}
export type ReadyBlueprintToInstance<T extends BlueprintToReady<any>> = Expand<{
    [columnName in keyof T as T[columnName] extends { type: string } ? columnName : never]: InferColumnTypeNullable<T[columnName]>
}>

type OptionalInsert = { primaryKey: true } | { nullable: true } | { default: Exclude<any, undefined> }

export type BlueprintToInsertInstance<T extends TableBlueprint<any>> = {
    [columnName in keyof T as T[columnName] extends OptionalInsert ? never : columnName]: InferColumnTypeNullable<T[columnName]>
} & {
    [columnName in keyof T as T[columnName] extends OptionalInsert ? columnName : never]?: InferColumnTypeNullable<T[columnName]>
}

type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never

export function isStrict(db: DatabaseConnection) {
    return true
}

export function isTableExists(db: DatabaseConnection, tableName: string) {
    return !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=$table`).get({ table: tableName })
}

export type ColumnInfo = {
    cid: number
    name: string
    type: string
    notnull: 0 | 1
    dflt_value: string | null
    pk: 0 | 1
}

export type TableColumns = {
    [k: string]: ColumnInfo
}

export function isEqualColumn(dbColumn: ColumnInfo, columnOptions: ColumnOptions) {
    if (!dbColumn) {
        return false
    }

    // split because strict appears in type like "REAL STRICT"
    if (dbColumn.type.split(" ")[0]!.toUpperCase() !== columnOptions.type.toUpperCase()) {
        return false
    }

    if (Boolean(dbColumn.notnull) === columnOptions.nullable) {
        return false
    }

    if (Boolean(dbColumn.pk) === !columnOptions.primaryKey) {
        return false
    }

    const blueprintNullDefault = columnOptions.default === null || columnOptions.default === undefined

    if (dbColumn.dflt_value === null) {
        if (blueprintNullDefault) {
            return true
        }

        return false
    }

    if (columnOptions.default === null || columnOptions.default === undefined) {
        return false
    }

    // string case
    if (dbColumn.dflt_value.startsWith("'") && dbColumn.dflt_value.endsWith("'")) {
        try {
            // the string is escaped
            if (dbColumn.dflt_value.substring(1, dbColumn.dflt_value.length - 1) === columnOptions.default) {
                return true
            }
        } catch {}

        return false
    }

    // blob
    if (dbColumn.dflt_value.startsWith("x'") && dbColumn.dflt_value.endsWith("'")) {
        if (typeof columnOptions.default === "string" || typeof columnOptions.default === "number") {
            return false
        }

        const data = Uint8Array.fromHex(dbColumn.dflt_value.substring(2, dbColumn.dflt_value.length - 1))
        try {
            // @ts-ignore
            const newData = Uint8Array.from(columnOptions.default)

            if (data.length !== newData.length || !(data as any as number[]).every((x, i) => x === data[i])) {
                return false
            }

            return true
        } catch {}

        return false
    }

    return Number(dbColumn.dflt_value) === columnOptions.default
}

export function isEqualColumns(columns: TableColumns, blueprint: TableBlueprint) {
    const blueprintEntries = Object.entries(blueprint)

    if (blueprintEntries.length !== Object.keys(columns).length) {
        return false
    }

    for (const [columnName, columnOptions] of blueprintEntries) {
        if (!columns[columnName] || !isEqualColumn(columns[columnName], columnOptions)) {
            return false
        }
    }

    return true
}

function columnCreateString(columnName: string, options: ColumnOptions) {
    let result = `${columnName} ${options.type}`

    if (options.foreignKey) {
        result += ` STRICT REFERENCES ${options.foreignKey.tableName}(${options.foreignKey.column})`
        return result
    }

    // if it is a primary key, then default strict is throwing
    if (!options.nonStrict && !(options.primaryKey && options.nonStrict === undefined)) {
        result += " STRICT"
    }

    if (!options.nullable) {
        result += " NOT NULL"
    }

    if (options.primaryKey) {
        result += " PRIMARY KEY"
    }

    if (options.autoIncrement) {
        result += " AUTOINCREMENT"
    }

    if (options.unique) {
        result += " UNIQUE"
    }

    // for some reason you can't prepare table creation normally ????
    // it just throws errors if it is not a sqlite-ready string
    // so no $value and then filling
    if ("default" in options) {
        switch (typeof options.default) {
            case "object":
                if (options.default === null) {
                    result += ` DEFAULT NULL`
                } else if (options.default instanceof Object.getPrototypeOf(Uint8Array)) {
                    result += ` DEFAULT x'${(options.default as Uint8Array).toHex()}'`
                }
                break
            case "string":
                result += ` DEFAULT '${options.default}'`
                break
            case "number":
                result += ` DEFAULT ${options.default}`
                break
        }
    }

    return result
}

export type TableCreationOptions = {
    /**
     * Please, for the love of god, don't use it in production
     * @default false
     */
    autoMigrate?: boolean
    /**
     * When table with same name exists and has different columns to provided scheme
     * it will throw.
     * If set to `true` then difference is ignored
     * @default false
     */
    ignoreTableDifference?: boolean
}

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never

function getPrimaryKeyOfBlueprint(bp: BlueprintToReady<any>): string | null {
    for (const [col, opts] of Object.entries(bp)) {
        if (opts.primaryKey) return col
    }
    return null
}

function findForeignKeyTo(source: BlueprintToReady<any>, targetTable: string, targetColumn: string): string | null {
    for (const [col, opts] of Object.entries(source)) {
        if (opts.foreignKey?.tableName === targetTable && opts.foreignKey?.column === targetColumn) {
            return col
        }
    }
    return null
}

function softlyTypeColumnValue(value: unknown, columnOption: ColumnOptions): BackTypeMap[keyof BackTypeMap] | null | undefined {
    if (value === null) {
        return columnOption.type === "NULL" || columnOption.nullable ? null : undefined
    }

    if (value === undefined) {
        return undefined
    }

    let converted: BackTypeMap[keyof BackTypeMap] | null | undefined

    switch (columnOption.type) {
        case "TEXT":
            if (typeof value === "string") {
                converted = value
            } else if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
                converted = String(value)
            }
            break
        case "INTEGER": {
            if (typeof value === "boolean") {
                converted = value ? 1 : 0
                break
            }

            const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN
            if (Number.isInteger(parsed)) {
                converted = parsed
            }
            break
        }
        case "REAL": {
            if (typeof value === "boolean") {
                converted = value ? 1 : 0
                break
            }

            const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN
            if (Number.isFinite(parsed)) {
                converted = parsed
            }
            break
        }
        case "BLOB":
            if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
                converted = value as NodeJS.TypedArray
            }
            break
        case "NULL":
            converted = value === null ? null : undefined
            break
    }

    if (converted === undefined) {
        return undefined
    }

    if ("enum" in columnOption && columnOption.enum && !columnOption.enum.includes(converted as never)) {
        return undefined
    }

    return converted
}

function softlyTypeBlueprintInstance<T extends TableBlueprint<any>>(blueprint: T, possibleInstance: any, options?: { omitKeys?: string[]; allowExtraKeys?: boolean }) {
    const omitKeys = new Set(options?.omitKeys ?? [])
    const blueprintKeys = Object.keys(blueprint)

    if (typeof possibleInstance !== "object" || !possibleInstance) {
        return null
    }

    const result: Record<string, any> = {}

    if (!options?.allowExtraKeys) {
        const extraKeys = Object.keys(possibleInstance).filter((key) => !(key in blueprint) || omitKeys.has(key))
        if (extraKeys.length > 0) {
            return null
        }
    }

    for (const key of blueprintKeys) {
        if (omitKeys.has(key)) {
            continue
        }

        const columnOption = blueprint[key]!
        const hasValue = key in possibleInstance

        if (!hasValue) {
            if (columnOption.primaryKey || columnOption.nullable || "default" in columnOption) {
                continue
            }

            return null
        }

        const converted = softlyTypeColumnValue(possibleInstance[key], columnOption)
        if (converted === undefined) {
            return null
        }

        result[key] = converted
    }

    if (options?.allowExtraKeys) {
        for (const [key, value] of Object.entries(possibleInstance)) {
            if (key in blueprint || omitKeys.has(key)) {
                continue
            }

            result[key] = value
        }
    }

    return result
}

export function createTable<TableName extends string, B extends TableBlueprint<any>, T = Expand<BlueprintToInstance<B>>>(
    db: DatabaseConnection,
    tableName: TableName,
    blueprint: B,
    options?: TableCreationOptions,
) {
    if (!isStrict(db)) {
        throw new Error("You should use strict Database")
    }

    const blueprintKeys = Object.keys(blueprint)
    const keysNoPrimaries = blueprintKeys.filter((columnName) => !blueprint[columnName]!.primaryKey)

    if (blueprintKeys.length - keysNoPrimaries.length !== 1) {
        throw new Error("Only 1 primary is allowed")
    }
    const primaryKey = blueprintKeys.filter((columnName) => blueprint[columnName]!.primaryKey)[0]!

    const currentColumns = Object.fromEntries((db.prepare(`PRAGMA table_info('${tableName}')`).all() as ColumnInfo[]).map((column) => [column.name, column]))

    const migrate = db.transaction(() => {
        const tempTableName = `${tableName}__temp__`
        const backupTableName = `${tableName}__backup__`

        db.exec(`CREATE TABLE IF NOT EXISTS ${tempTableName} (
            ${blueprintKeys.map((columnName) => columnCreateString(columnName, blueprint[columnName]!)).join(",\n")}
        )`)

        const oldNewColumns = blueprintKeys
            .filter((key) => currentColumns[key])
            .map((column) => `\`${column}\``)
            .join(", ")

        db.exec(`INSERT INTO ${tempTableName} (${oldNewColumns}) SELECT ${oldNewColumns} FROM ${tableName}`)
        db.exec(`PRAGMA foreign_keys = OFF;
                ALTER TABLE ${tableName} RENAME TO ${backupTableName};
                ALTER TABLE ${tempTableName} RENAME TO ${tableName};
                PRAGMA foreign_keys = ON;`)

        return backupTableName
    })

    if (Object.keys(currentColumns).length === 0 || isEqualColumns(currentColumns, blueprint) || options?.ignoreTableDifference) {
        db.exec(`CREATE TABLE IF NOT EXISTS ${tableName} (
            ${blueprintKeys.map((columnName) => columnCreateString(columnName, blueprint[columnName]!)).join(",\n")}
        )`)
    } else if (options?.autoMigrate) {
        migrate()
    } else {
        throw new Error(`Table ${tableName} already exists and is different to expected`)
    }

    const getAllQuery = db.prepare(`SELECT * FROM ${tableName}`)

    const names = blueprintKeys.join(", ")
    const valuePlaceholders = blueprintKeys.map((x) => "$" + x).join(", ")

    const insertQuery = keysNoPrimaries.length !== 0 ? db.prepare(`INSERT INTO ${tableName} (${names}) VALUES (${valuePlaceholders})`) : db.prepare(`INSERT INTO ${tableName} DEFAULT VALUES`)
    const updateAssignments = keysNoPrimaries.map((columnName) => `${columnName} = $${columnName}`).join(", ")
    const updateQuery =
        keysNoPrimaries.length !== 0
            ? db.prepare(`UPDATE ${tableName} SET ${updateAssignments} WHERE ${primaryKey} = $${primaryKey}`)
            : db.prepare(`UPDATE ${tableName} SET ${primaryKey} = $${primaryKey} WHERE ${primaryKey} = $${primaryKey}`)

    const insertGetBackQuery = db.prepare(`SELECT * FROM ${tableName} WHERE ${primaryKey} = $id`)

    const defaultInstance = Object.fromEntries(blueprintKeys.map((columnName) => [columnName, blueprint[columnName]?.default ?? null]))

    const resultBlueprint = structuredClone(blueprint) as BlueprintToReady<B>

    for (const columnKey in resultBlueprint) {
        const column = resultBlueprint[columnKey]!

        if (column.foreignKey) {
            continue
        }

        column.foreignKey = { tableName: tableName, column: columnKey }
    }

    function getAll(): T[]
    function getAll<Cnt extends BlueprintToReady<any>>(options: {
        include?: undefined
        count?: Cnt[]
    }): Expand<
        T & {
            [K in Cnt["tableName"] as `${K}Count`]: number
        }
    >[]
    function getAll<Inc extends BlueprintToReady<any>>(options: { include?: Inc[]; count?: undefined }): Expand<T & UnionToIntersection<ReadyBlueprintToInstance<Inc>>>[]
    function getAll<Inc extends BlueprintToReady<any>, Cnt extends BlueprintToReady<any>>(options: {
        include?: Inc[]
        count?: Cnt[]
    }): Expand<
        T &
            UnionToIntersection<ReadyBlueprintToInstance<Inc>> & {
                [K in Cnt["tableName"] as `${K}Count`]: number
            }
    >[]
    function getAll(options?: { include?: BlueprintToReady<any>[]; count?: BlueprintToReady<any>[] }): any {
        if (!options || (!options.include && !options.count)) {
            return getAllQuery.all() as any
        }

        const include = options.include ?? []
        const count = options.count ?? []

        const selectParts: string[] = [`${tableName}.*`]
        const aliasMap = new Map<string, string>()

        for (const other of include) {
            selectParts.push(`${other.tableName}.*`)
        }

        for (const other of count) {
            const fkColumn = findForeignKeyTo(other, tableName, primaryKey!)

            if (!fkColumn) {
                throw new Error(`Cannot count related rows in ${other.tableName}: no foreign key pointing to ${tableName}.${primaryKey}`)
            }

            const alias = `${other.tableName}Count`
            aliasMap.set(other.tableName, alias)
            selectParts.push(`(SELECT COUNT(*) FROM ${other.tableName} WHERE ${fkColumn} = ${tableName}.${primaryKey}) AS ${alias}`)
        }

        const selectClause = selectParts.join(", ")

        let fromClause = `FROM ${tableName}`

        for (const other of include) {
            let joinCol = null
            for (const [col, opts] of Object.entries(blueprint)) {
                if (opts.foreignKey?.tableName === other.tableName) {
                    joinCol = col
                    break
                }
            }

            if (joinCol) {
                const otherPk = getPrimaryKeyOfBlueprint(other)

                if (!otherPk) {
                    throw new Error(`Table ${other.tableName} has no primary key`)
                }

                fromClause += ` INNER JOIN ${other.tableName} ON ${tableName}.${joinCol} = ${other.tableName}.${otherPk}`
                continue
            }

            for (const [col, opts] of Object.entries(other)) {
                if (opts.foreignKey?.tableName === tableName && opts.foreignKey?.column === primaryKey) {
                    joinCol = col
                    break
                }
            }

            if (joinCol) {
                fromClause += ` LEFT JOIN ${other.tableName} ON ${other.tableName}.${joinCol} = ${tableName}.${primaryKey}`
                continue
            }

            throw new Error(`No relationship found between ${tableName} and ${other.tableName}`)
        }

        const query = `SELECT ${selectClause} ${fromClause}`
        const rows = db.prepare(query).all() as any[]

        return rows
    }

    function insert(instance: Expand<BlueprintToInsertInstance<B>>, returnInsert?: false): Result<Changes, SQLiteError>
    function insert(instance: Expand<BlueprintToInsertInstance<B>>, returnInsert: true): Result<T, SQLiteError>
    function insert(instance: Expand<BlueprintToInsertInstance<B>>, returnInsert?: boolean): Result<Changes | T, SQLiteError> {
        try {
            const softlyTypedInstance = softlyTypeBlueprintInstance(blueprint, instance) ?? instance
            const changes = insertQuery.run({ ...defaultInstance, ...softlyTypedInstance })

            if (!returnInsert) {
                return [changes, null]
            }

            return [insertGetBackQuery.get({ id: changes.lastInsertRowid }) as any, null]
        } catch (e: any) {
            return [null, e]
        }
    }

    function update(instance: T, returnUpdated?: false): Result<Changes, SQLiteError | Error>
    function update(instance: T, returnUpdated: true): Result<T, SQLiteError | Error>
    function update(instance: T, returnUpdated?: boolean): Result<Changes | T, SQLiteError | Error> {
        try {
            const softlyTypedInstance = softlyTypeBlueprintInstance(blueprint, instance)

            if (!softlyTypedInstance) {
                return [null, new Error(`Invalid instance for table ${tableName}`)]
            }

            const changes = updateQuery.run({ ...defaultInstance, ...softlyTypedInstance })

            if (changes.changes === 0) {
                return [null, new Error(`Not updated: ${tableName}.${primaryKey} not found`)]
            }

            if (!returnUpdated) {
                return [changes, null]
            }

            return [insertGetBackQuery.get({ id: (softlyTypedInstance as any)[primaryKey] }) as any, null]
        } catch (e: any) {
            return [null, e]
        }
    }

    return {
        ...(resultBlueprint as BlueprintToReady<B>),
        get tableName() {
            return tableName
        },
        primaryKey: primaryKey as {
            [K in keyof B]: B[K] extends { primaryKey: true } ? K : never
        }[keyof B],
        /**
         * @returns {string} name of backup table
         */
        migrate,
        getAll,
        insert,
        update,
        softlyTypeInstance(possibleInstance?: any, omitKeys?: (keyof T)[]) {
            return softlyTypeBlueprintInstance(blueprint, possibleInstance, { omitKeys: omitKeys?.map(String) }) as Expand<BlueprintToInsertInstance<B>> | null
        },
        insertMany(instances: Expand<BlueprintToInsertInstance<B>>[]) {
            instances.forEach((instance) => {
                const softlyTypedInstance = softlyTypeBlueprintInstance(blueprint, instance) ?? instance
                insertQuery.run({ ...defaultInstance, ...softlyTypedInstance })
            })
        },
        getAllBy<K extends Exclude<keyof T, symbol>>(name: K, value: T[K]): T[] {
            // why the hell i can't just column = null
            // okay i understand now
            if (value === null) {
                return db.prepare(`SELECT * FROM ${tableName} WHERE ${name} IS NULL`).all() as any
            }

            return db.prepare(`SELECT * FROM ${tableName} WHERE ${name} = $value`).all({ value: value as BackTypeMap[keyof BackTypeMap] }) as any
        },
        getOneBy<K extends Exclude<keyof T, symbol>>(name: K, value: T[K]): T | undefined {
            if (value === null) {
                return db.prepare(`SELECT * FROM ${tableName} WHERE ${name} IS NULL LIMIT 1`).all()[0] as any
            }

            // i cant set name after ?
            return db.prepare(`SELECT * FROM ${tableName} WHERE ${name} = $value LIMIT 1`).all({ value: value as BackTypeMap[keyof BackTypeMap] })[0] as any
        },
        deleteAllBy<K extends Exclude<keyof T, symbol>>(name: K, value: T[K]) {
            if (value === null) {
                db.prepare(`DELETE FROM ${tableName} WHERE ${name} IS NULL`).all()
                return
            }
            db.prepare(`DELETE FROM ${tableName} WHERE ${name} = $value`).run({ value: value as BackTypeMap[keyof BackTypeMap] })
        },
        verifyInstance(possibleInstance?: any, omitKeys?: (keyof T)[]): possibleInstance is T {
            return softlyTypeBlueprintInstance(blueprint, possibleInstance, { omitKeys: omitKeys?.map(String) }) !== null
        },
    }
}

export const Column = Object.freeze({
    foreignKey<C extends ColumnOptions<any>>(columnOptions: C & { foreignKey: { tableName: string; column: string } }, nullable?: boolean) {
        return { type: columnOptions.type, foreignKey: columnOptions.foreignKey, nullable } as { type: C["type"]; foreignKey: { tableName: string; column: string } }
    },
    primaryKey() {
        return { type: "INTEGER", primaryKey: true } satisfies ColumnOptions
    },
})

export const Table = Object.freeze({
    jsonTags<TableName extends string, B extends TableBlueprint<any>, T = Expand<BlueprintToInstance<B>>>(db: DatabaseConnection, tableName: TableName, requiredData: B, options?: TableCreationOptions) {
        const mainTable = createTable(db, tableName, requiredData, options)

        const mainPrimary = getPrimaryKeyOfBlueprint(mainTable)!

        const tagsTableName = `${tableName}_json_tags`
        const tagsTable = createTable(db, tagsTableName, {
            id: Column.primaryKey(),
            mainId: Column.foreignKey((mainTable as any)[mainPrimary]),
            key: { type: "TEXT" },
            data: { type: "TEXT", nullable: true },
        })

        const getAllQuery = db.prepare(`
        SELECT 
            main.*,
            COALESCE(
                (
                    SELECT json_group_object(
                        t.key,
                        CASE
                            WHEN json_valid(t.data) = 1 THEN json(t.data)
                            ELSE t.data
                        END
                    )
                    FROM ${tagsTableName} t 
                    WHERE t.mainId = main.${mainPrimary}
                ),
                '{}'
            ) as tags
        FROM ${tableName} main`)

        const requiredKeys = Object.keys(requiredData)
        const getOneQuery = db.prepare(`
        SELECT 
            main.*,
            COALESCE(
                (
                    SELECT json_group_object(
                        t.key,
                        CASE
                            WHEN json_valid(t.data) = 1 THEN json(t.data)
                            ELSE t.data
                        END
                    )
                    FROM ${tagsTableName} t 
                    WHERE t.mainId = main.${mainPrimary}
                ),
                '{}'
            ) as tags
        FROM ${tableName} main
        WHERE main.${mainPrimary} = $id`)

        function insert(instance: T & { [k: string]: any }, returnInsert?: false): Result<Changes, string>
        function insert(instance: T & { [k: string]: any }, returnInsert: true): Result<T, string>
        function insert(instance: T & { [k: string]: any }, returnInsert?: boolean): Result<any, string> {
            const softlyTypedInstance = softlyTypeBlueprintInstance(requiredData, instance, { allowExtraKeys: true }) ?? instance
            const mainInsert: { [k: string]: any } = {}
            for (const key of requiredKeys) {
                mainInsert[key] = softlyTypedInstance[key]
            }

            const [inserted, insertError] = mainTable.insert(mainInsert as any, true)

            if (!inserted) {
                return [null, `Not inserted ${insertError?.message}`]
            }

            let changes = 1
            for (const key in softlyTypedInstance) {
                if (key in mainInsert) {
                    continue
                }

                changes++
                tagsTable.insert({
                    mainId: (inserted as any)[mainPrimary],
                    key: key,
                    data: softlyTypedInstance[key] ?? null,
                })
            }

            if (returnInsert) {
                return [inserted, null]
            }

            return [
                {
                    changes: changes,
                    lastInsertRowid: (inserted as any)[mainPrimary],
                },
                null,
            ]
        }

        const updateTransaction = db.transaction((instance: T & { [k: string]: any }, returnUpdated?: boolean) => {
            const softlyTypedInstance = softlyTypeBlueprintInstance(requiredData, instance, { allowExtraKeys: true }) ?? instance
            const mainUpdate: { [k: string]: any } = {}
            for (const key of requiredKeys) {
                mainUpdate[key] = softlyTypedInstance[key]
            }

            const [updated, updateError] = mainTable.update(mainUpdate as any, true)

            if (!updated) {
                throw new Error(`Not updated ${updateError?.message ?? updateError}`)
            }

            tagsTable.deleteAllBy("mainId", (mainUpdate as any)[mainPrimary])

            let changes = 1
            for (const key in softlyTypedInstance) {
                if (key in mainUpdate) {
                    continue
                }

                changes++
                const [, tagError] = tagsTable.insert({
                    mainId: (updated as any)[mainPrimary],
                    key: key,
                    data: softlyTypedInstance[key] ?? null,
                })

                if (tagError) {
                    throw tagError
                }
            }

            if (returnUpdated) {
                const row = getOneQuery.get({ id: (updated as any)[mainPrimary] }) as (Record<string, any> & { tags: string }) | null
                if (!row) {
                    throw new Error(`Not updated ${tableName}.${mainPrimary} not found`)
                }

                const { tags, ...main } = row
                return [{ ...main, ...JSON.parse(tags) }, null] as const
            }

            return [
                {
                    changes,
                    lastInsertRowid: (updated as any)[mainPrimary],
                },
                null,
            ] as const
        })

        function update(instance: T & { [k: string]: any }, returnUpdated?: false): Result<Changes, string>
        function update(instance: T & { [k: string]: any }, returnUpdated: true): Result<T, string>
        function update(instance: T & { [k: string]: any }, returnUpdated?: boolean): Result<any, string> {
            try {
                return updateTransaction(instance, returnUpdated) as Result<any, string>
            } catch (e: any) {
                return [null, e?.message ?? String(e)]
            }
        }

        const getAllKeysquery = db.prepare(`SELECT DISTINCT key FROM ${tagsTableName}`)

        const resultBlueprint = structuredClone(requiredData) as BlueprintToReady<B>

        for (const columnKey in resultBlueprint) {
            const column = resultBlueprint[columnKey]!

            if (column.foreignKey) {
                continue
            }

            column.foreignKey = { tableName: tableName, column: columnKey }
        }
        return {
            ...(resultBlueprint as BlueprintToReady<B>),
            getAll(): (T & Record<string, any>)[] {
                return (getAllQuery.all() as (Record<string, any> & { tags: string })[]).map((row) => {
                    const { tags, ...main } = row
                    return { ...main, ...JSON.parse(tags) }
                })
            },
            insert,
            update,
            softlyTypeInstance(possibleInstance: any, omitKeys?: (keyof T)[]) {
                return softlyTypeBlueprintInstance(requiredData, possibleInstance, {
                    omitKeys: omitKeys?.map(String),
                    allowExtraKeys: true,
                }) as (T & Record<string, any>) | null
            },
            verifyInstance(possibleInstance: any, omitKeys?: (keyof T)[]): possibleInstance is T {
                return (
                    softlyTypeBlueprintInstance(requiredData, possibleInstance, {
                        omitKeys: omitKeys?.map(String),
                        allowExtraKeys: true,
                    }) !== null
                )
            },
            deleteAllBy<K extends Exclude<keyof T, symbol>>(name: K, value: T[K]) {
                if (value === null) {
                    db.prepare(`DELETE FROM ${tableName} WHERE ${name} IS NULL`).all()
                    return
                }
                db.prepare(`DELETE FROM ${tableName} WHERE ${name} = $value`).run({ value: value as BackTypeMap[keyof BackTypeMap] })
            },
            getAllTagKeys() {
                return (getAllKeysquery.all() as { key: string }[]).map((row) => row.key)
            },
        }
    },
})
