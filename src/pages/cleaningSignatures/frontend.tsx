import { Fragment, StrictMode, useContext, useEffect, useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { PageLayout } from "../layout"
import styles from "./index.module.css"
import "../global.css"
import { firstWeekFirstDay } from "@/constants";

const elem = document.getElementById("root")!

function formatDate(date: Date) {
    return `${date.getDate()}.${(date.getMonth() + 1 + "").padStart(2, "0")}`
}

function App() {
    const maxFloor = 10
    const floorsArr = Array.from({ length: maxFloor }, (_, i) => i + 1)
    
    const [weekStr, setWeekStr] = useState("")
    const [enabledFloors, setEnabledFloors] = useState(new Set(floorsArr))
    const weekNumber = Number(weekStr)
    const isWeekValid = Number.isSafeInteger(weekNumber) && weekStr

    const days = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"]
    const startDay = new Date(+firstWeekFirstDay + (isWeekValid ? (weekNumber - 1) *  7 * 24 * 60 * 60 * 1000 : 0))
    const daysDates = days.map((_, i) => new Date(+startDay + (i * 24 * 60 * 60 * 1000))).map(formatDate)

    return (
        <div>
            <label className={styles.weekInputLabel}>
                <span>
                    Неделя:
                </span>
                <input value={weekStr} onChange={(e) => setWeekStr(e.target.value)} />
            </label>
            <table className={styles.mainTable} style={{ width: "100%" }}>
                <thead>
                    <tr>
                        <th>
                            {isWeekValid ? weekNumber : "?"} неделя
                        </th>
                        {days.map((val, i) => <th key={val}>{val} {daysDates[i]}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {floorsArr.filter(floor => enabledFloors.has(floor)).map((floor) => <Fragment key={floor}>
                        <tr>
                            <th>
                                {floor} Этаж
                            </th>
                            {days.map((val, i) => <td key={val}>{val} {daysDates[i]}</td>)}
                        </tr>
                        <tr>
                            <th>
                                Время
                            </th>
                            {days.map((val, i) => <td key={val}>Время</td>)}
                        </tr>
                    </Fragment>)}
                </tbody>
            </table>
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
