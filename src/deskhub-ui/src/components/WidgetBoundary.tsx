import { TriangleAlert } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Через сколько пробовать отрисовать виджет снова (ошибка могла быть из-за временно битых данных). */
const RETRY_MS = 30_000

interface Props {
  /** Имя виджета — для лога */
  name: string
  children: ReactNode
}

interface State {
  failed: boolean
}

/**
 * Изоляция ошибок рендера: упавший виджет показывает заглушку в своей ячейке, остальной дашборд работает.
 * Без этого исключение в одном компоненте размонтирует всё React-дерево — киоск показал бы чёрный экран.
 * Через 30 с — повторная попытка отрисовки.
 */
export class WidgetBoundary extends Component<Props, State> {
  state: State = { failed: false }
  private retryTimer: ReturnType<typeof setTimeout> | undefined

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[widget] ${this.props.name} crashed`, error, info.componentStack)
    clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => this.setState({ failed: false }), RETRY_MS)
  }

  componentWillUnmount(): void {
    clearTimeout(this.retryTimer)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section className="flex h-full flex-col items-center justify-center gap-2 overflow-hidden rounded-card bg-surface-1 p-4 text-center">
        <TriangleAlert className="size-7 text-fg-muted" strokeWidth={1.5} aria-hidden />
        <p className="text-[13px] font-medium text-fg-secondary">Виджет временно недоступен</p>
        <p className="text-[11px] text-fg-muted">Повторная попытка через 30 с</p>
      </section>
    )
  }
}
