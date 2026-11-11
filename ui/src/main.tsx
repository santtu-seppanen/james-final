import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Stage } from './Stage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Stage>
      <App />
    </Stage>
  </StrictMode>,
)
