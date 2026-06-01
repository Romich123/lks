import { createContext, useCallback, useEffect, useState } from "react"
import styles from "./index.module.css"

export type AlertType = "warning" | "error" | "info"

export type AlertOptions = {
    type?: AlertType
    delay?: number
    priority?: AlertType
}

type Alert = {
    id: string
    message: string
    type: AlertType
    priority: AlertType
    createdAt: number
    autoDismiss: boolean
    delay: number
}

export const alertsContext = createContext<{
    showAlert(message: string, options?: AlertOptions): void
}>({} as any)

const MAX_ALERTS = 5

function getPriorityValue(type: AlertType): number {
    switch (type) {
        case "error":
            return 3
        case "warning":
            return 2
        case "info":
            return 1
    }
}

export function AlertsProvider(props: React.PropsWithChildren) {
    const [alerts, setAlerts] = useState<Alert[]>([])

    const removeAlert = useCallback((id: string) => {
        setAlerts((current) => current.filter((alert) => alert.id !== id))
    }, [])

    const showAlert = useCallback(
        (message: string, options?: AlertOptions) => {
            const type = options?.type ?? "warning"
            const priority = options?.priority ?? type
            const autoDismiss = type !== "error" || options?.delay !== undefined
            const delay = options?.delay ?? 7000

            const newAlert: Alert = {
                id: Math.random().toString(36).substring(2, 9),
                message,
                type,
                priority,
                createdAt: Date.now(),
                autoDismiss,
                delay,
            }

            setAlerts((current) => {
                const candidate = [...current, newAlert]
                if (candidate.length <= MAX_ALERTS) {
                    return candidate
                }

                // Sort by priority desc, then by creation time desc (newest first)
                const sorted = [...candidate].sort((a, b) => {
                    const priorityDiff = getPriorityValue(b.priority) - getPriorityValue(a.priority)
                    if (priorityDiff !== 0) return priorityDiff
                    return b.createdAt - a.createdAt
                })

                // Keep top MAX_ALERTS highest priority (and newest among equals)
                return sorted.slice(0, MAX_ALERTS)
            })
        },
        [removeAlert],
    )

    return (
        <alertsContext.Provider value={{ showAlert }}>
            <div className={styles.container}>
                {alerts.map((alert) => (
                    <AlertItem key={alert.id} alert={alert} onClose={() => removeAlert(alert.id)} />
                ))}
            </div>
            {props.children}
        </alertsContext.Provider>
    )
}

type AlertItemProps = {
    alert: Alert
    onClose: () => void
}

function AlertItem({ alert, onClose }: AlertItemProps) {
    useEffect(() => {
        if (!alert.autoDismiss) return

        const timer = setTimeout(() => {
            onClose()
        }, alert.delay)

        return () => clearTimeout(timer)
    }, [alert.autoDismiss, alert.delay, onClose])

    const getIcon = () => {
        switch (alert.type) {
            case "error":
                return (
                    <svg className={styles.icon} viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zM4.5 7.5a.5.5 0 0 0 0 1h5.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3a.5.5 0 0 0 0-.708l-3-3a.5.5 0 1 0-.708.708L10.293 7.5H4.5z" />
                    </svg>
                )
            case "info":
                return (
                    <svg className={styles.icon} viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.47l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
                    </svg>
                )
            case "warning":
                return (
                    <svg className={styles.icon} viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
                    </svg>
                )
        }
    }

    return (
        <div className={`${styles.alert} ${styles[alert.type]}`}>
            {getIcon()}
            <div className={styles.message}>{alert.message}</div>
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Закрыть">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
                </svg>
            </button>
        </div>
    )
}
