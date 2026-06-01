import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

const elem = document.getElementById("root")!
const app = (
    <StrictMode>
        <div>404</div>
    </StrictMode>
)

if (import.meta.hot) {
    // With hot module reloading, `import.meta.hot.data` is persisted.
    const root = (import.meta.hot.data.root ??= createRoot(elem))
    root.render(app)
} else {
    // The hot module reloading API is not available in production.
    createRoot(elem).render(app)
}
