import React, { useContext } from "react"
import { urls } from "./urls"
import { QueryProvider } from "./query"
import { authContext, AuthProvider } from "./shared/auth/AuthProvider"
import { AlertsProvider } from "./shared/alerts/AlertsProvider"
import "./global.css"

function PageHeader() {
    const { user } = useContext(authContext)

    return (
        <header id="page-header">
            <a href={urls.index}>ЛКС</a>
            {user ? <div>{user.login}</div> : null}
        </header>
    )
}

export function PageLayout(props: React.PropsWithChildren) {
    return (
        <QueryProvider>
            <AuthProvider>
                <AlertsProvider>
                    <PageHeader />
                    <div id="page-content">
                        <div id="page-side-menu">
                            <nav>
                                <ul>
                                    {/* <li className="side-menu-item">
                                        <a href={urls.classrooms}>Кабинеты</a>
                                    </li>
                                    <li className="side-menu-item">
                                        <a href={urls.teachers}>Преподаватели</a>
                                    </li>
                                    <li className="side-menu-item">
                                        <a href={urls.lessons}>Занятия</a>
                                    </li>
                                    <li className="side-menu-item">
                                        <a href={urls.equipment}>Оборудование</a>
                                    </li> */}
                                    <li className="side-menu-item">
                                        <a href={urls.schedule}>Расписание</a>
                                    </li>
                                    <li className="side-menu-item">
                                        <a href={urls.timetableEdit}>Рабочее время</a>
                                    </li>
                                    <li className="side-menu-item">
                                        <a href={urls.timetableShow}>Рабочее время (показ)</a>
                                    </li>
                                </ul>
                            </nav>
                        </div>
                        <div id="page-actual-content-wrapper">
                            <div id="page-actual-content">{props.children}</div>
                        </div>
                    </div>
                </AlertsProvider>
            </AuthProvider>
        </QueryProvider>
    )
}
