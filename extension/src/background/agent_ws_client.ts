/**
 * agent_ws_client.ts
 *
 * Client-side WebSocket manager for communicating with the FastAPI backend agent.
 * Manages connection lifecycle, auto-reconnection, heartbeat pings, and structured messaging.
 */

import { logger } from '../shared/logger';
import type {
  ExtToBackendMessage,
  BackendToExtMessage,
  UnifiedPageRepresentation,
  ActionResult,
} from '../shared/types';

export type ActionHandler = (message: BackendToExtMessage) => void;

export class AgentWebSocketClient {
  private url: string;
  private ws: WebSocket | null = null;
  private pingInterval: any = null;
  private onActionCallback: ActionHandler | null = null;
  private isConnected = false;

  constructor(url: string = 'ws://localhost:8000/ws/agent') {
    this.url = url;
  }

  public connect(onAction: ActionHandler): Promise<void> {
    this.onActionCallback = onAction;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          logger.info(`[AgentWS] Connected to backend at ${this.url}`);
          this.isConnected = true;
          this.startHeartbeat();
          resolve();
        };

        this.ws.onmessage = (event: MessageEvent) => {
          try {
            const data: BackendToExtMessage = JSON.parse(event.data);
            if (data.message_type === 'pong') {
              logger.debug('[AgentWS] Received pong keepalive');
              return;
            }

            logger.info(`[AgentWS] Received message: ${data.message_type}`, {
              step: data.step,
              actionsCount: data.actions?.length ?? 0,
              done: data.done,
            });

            if (this.onActionCallback) {
              this.onActionCallback(data);
            }
          } catch (err) {
            logger.error('[AgentWS] Failed to parse message from backend', err);
          }
        };

        this.ws.onclose = () => {
          logger.warn('[AgentWS] Disconnected from backend');
          this.isConnected = false;
          this.stopHeartbeat();
        };

        this.ws.onerror = (err) => {
          logger.error('[AgentWS] WebSocket error', err);
          reject(err);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  public sendPageContext(
    sessionId: string,
    goal: string,
    upr: UnifiedPageRepresentation,
    step: number = 1
  ): void {
    const msg: ExtToBackendMessage = {
      session_id: sessionId,
      message_type: 'page_context',
      goal,
      upr,
      step,
    };
    this.send(msg);
  }

  public sendActionResult(
    sessionId: string,
    actionResult: ActionResult,
    step: number
  ): void {
    const msg: ExtToBackendMessage = {
      session_id: sessionId,
      message_type: 'action_result',
      action_result: actionResult,
      step,
    };
    this.send(msg);
  }

  public sendPing(sessionId: string, step: number = 1): void {
    const msg: ExtToBackendMessage = {
      session_id: sessionId,
      message_type: 'ping',
      step,
    };
    this.send(msg);
  }

  private send(msg: ExtToBackendMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('[AgentWS] Cannot send message, WebSocket is not open');
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.isConnected) {
        this.sendPing('heartbeat');
      }
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public disconnect(): void {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}
