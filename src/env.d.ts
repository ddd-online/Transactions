import type { CommandName, CommandReq, CommandRes } from '../shared/commands'

export {}

declare global {
  interface Window {
    api: {
      invoke<N extends CommandName>(name: N, req?: CommandReq<N>): Promise<CommandRes<N>>
      onEvent(callback: (message: { event: string; payload: unknown }) => void): void
      platform: string
    }
  }
}
