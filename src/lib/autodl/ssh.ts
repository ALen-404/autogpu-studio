import { Client, type ClientChannel } from 'ssh2'
import type { AutoDLActionResult } from './client'

interface AutoDLSshTarget {
  host: string
  port: number
  username: string
}

export interface RunAutoDLWorkerStartCommandOverSshParams {
  sshCommand: string
  rootPassword: string
  startCommand: string
  timeoutMs?: number
}

export function parseAutoDLSshCommand(sshCommand: string): AutoDLSshTarget {
  const value = sshCommand.trim()
  const portMatch = value.match(/(?:^|\s)-p\s+(\d+)(?:\s|$)/)
  const port = portMatch ? Number(portMatch[1]) : 22
  const target = value.split(/\s+/).find((part) => part.includes('@') && !part.startsWith('-'))
  if (!target || !Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('AUTODL_SSH_COMMAND_INVALID')
  }
  const atIndex = target.indexOf('@')
  const username = target.slice(0, atIndex).trim() || 'root'
  const host = target.slice(atIndex + 1).trim()
  if (!host) throw new Error('AUTODL_SSH_COMMAND_INVALID')
  return { host, port, username }
}

function appendSafeOutput(target: string[], chunk: unknown): void {
  const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '')
  if (!text) return
  target.push(text)
  if (target.join('').length > 4000) {
    target.splice(0, Math.max(0, target.length - 12))
  }
}

export async function runAutoDLWorkerStartCommandOverSsh(
  params: RunAutoDLWorkerStartCommandOverSshParams,
): Promise<AutoDLActionResult> {
  const target = parseAutoDLSshCommand(params.sshCommand)
  const password = params.rootPassword.trim()
  const startCommand = params.startCommand.trim()
  if (!password) throw new Error('AUTODL_SSH_PASSWORD_REQUIRED')
  if (!startCommand) throw new Error('AUTODL_SSH_START_COMMAND_REQUIRED')
  const timeoutMs = Math.max(10_000, params.timeoutMs || 360_000)

  return new Promise((resolve, reject) => {
    const client = new Client()
    const output: string[] = []
    let settled = false
    const finish = (error: Error | null, result?: AutoDLActionResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      client.end()
      if (error) {
        reject(error)
        return
      }
      resolve(result || {
        ok: true,
        requestId: 'ssh_reinject',
        message: 'AutoDL Worker 已重新注入',
      })
    }
    const timer = setTimeout(() => {
      client.destroy()
      finish(new Error('AUTODL_SSH_COMMAND_TIMEOUT'))
    }, timeoutMs)

    client
      .on('ready', () => {
        client.exec(startCommand, (error: Error | undefined, stream: ClientChannel) => {
          if (error) {
            finish(new Error('AUTODL_SSH_EXEC_FAILED'))
            return
          }
          stream.on('close', (code: number | null) => {
            if (code !== 0) {
              finish(new Error('AUTODL_SSH_COMMAND_FAILED'))
              return
            }
            finish(null, {
              ok: true,
              requestId: 'ssh_reinject',
              message: output.join('').includes('AutoGPU Worker started')
                ? 'AutoDL Worker 已重新注入'
                : 'AutoDL SSH 命令已执行',
            })
          })
          stream.on('data', (chunk: unknown) => appendSafeOutput(output, chunk))
          stream.stderr.on('data', (chunk: unknown) => appendSafeOutput(output, chunk))
        })
      })
      .on('error', () => {
        finish(new Error('AUTODL_SSH_CONNECT_FAILED'))
      })
      .connect({
        host: target.host,
        port: target.port,
        username: target.username,
        password,
        readyTimeout: Math.min(timeoutMs, 30_000),
        keepaliveInterval: 10_000,
      })
  })
}
