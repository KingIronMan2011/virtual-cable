import { useState, useCallback, useRef, useEffect } from "react";
import type { Tunnel } from "../types";
import { tauriAPI } from "../tauriAPI";

export function useTunnels(loaded: boolean) {
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  // Per-tunnel serial queue
  const updateQueues = useRef(new Map<string, Promise<void>>());
  const tunnelsRef = useRef<Tunnel[]>([]);
  tunnelsRef.current = tunnels;

  useEffect(() => {
    if (!loaded) return;
    // Always save tunnels as inactive so they don't auto-start on next launch
    const toSave = tunnels.map((t) => ({ ...t, active: false, muted: false }));
    tauriAPI.saveTunnels(toSave);
  }, [tunnels, loaded]);

  const enqueue = useCallback((id: string, op: () => Promise<void>) => {
    const tail = (updateQueues.current.get(id) ?? Promise.resolve()).then(op);
    updateQueues.current.set(id, tail.catch(console.error));
  }, []);

  const addTunnel = useCallback(() => {
    setTunnels((prev) => {
      const n = prev.length + 1;
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          name: `Cable ${String(n).padStart(2, "0")}`,
          inputs: [{ deviceId: null, appPid: null, gain: 1, priority: false }],
          outputDeviceId: null,
          active: false,
          muted: false,
          channelCount: null,
          gain: 1,
          duckingEnabled: false,
          duckingAmount: 0.15,
          duckingRelease: 1000,
          hotkey: n <= 9 ? `Ctrl+Alt+Numpad${n}` : null,
        },
      ];
    });
  }, []);

  const deleteTunnel = useCallback(async (id: string) => {
    await tauriAPI.destroyTunnel(id);
    setTunnels((prev) => prev.filter((t) => t.id !== id));
    updateQueues.current.delete(id);
  }, []);

  const updateTunnel = useCallback(
    (updated: Tunnel) => {
      enqueue(updated.id, async () => {
        setTunnels((ts) => ts.map((t) => (t.id === updated.id ? updated : t)));
        await tauriAPI.destroyTunnel(updated.id);
      });
    },
    [enqueue],
  );

  const toggleTunnelActive = useCallback(
    (id: string) => {
      if (togglingIds.has(id)) return;

      setTogglingIds((prev) => new Set(prev).add(id));

      enqueue(id, async () => {
        const current = tunnelsRef.current.find((t) => t.id === id);
        if (!current) return;
        const next: Tunnel = {
          ...current,
          active: !current.active,
          muted: current.active ? false : current.muted,
        };
        setTunnels((ts) => ts.map((t) => (t.id === id ? next : t)));

        const readyInputs = next.inputs.filter(
          (inp) => inp.deviceId !== null || inp.appPid !== null,
        );

        try {
          if (
            next.active &&
            readyInputs.length > 0 &&
            next.outputDeviceId !== null
          ) {
            await tauriAPI.createTunnel(
              next.id,
              readyInputs.map((inp) => ({
                deviceId: inp.deviceId ?? 0,
                appPid: inp.appPid ?? undefined,
                gain: inp.gain,
                priority: inp.priority,
              })),
              next.outputDeviceId,
              next.channelCount,
              {
                enabled: next.duckingEnabled,
                amount: next.duckingAmount,
                release: next.duckingRelease,
              },
            );
            await tauriAPI.setTunnelMuted(next.id, next.muted);
          } else {
            await tauriAPI.destroyTunnel(next.id);
          }
        } finally {
          setTogglingIds((prev) => {
            const nextSet = new Set(prev);
            nextSet.delete(id);
            return nextSet;
          });
        }
      });
    },
    [enqueue, togglingIds],
  );

  const toggleTunnelMute = useCallback(
    (id: string) => {
      enqueue(id, async () => {
        const current = tunnelsRef.current.find((t) => t.id === id);
        if (!current?.active) return;
        const next: Tunnel = { ...current, muted: !current.muted };
        setTunnels((ts) => ts.map((t) => (t.id === id ? next : t)));
        await tauriAPI.setTunnelMuted(next.id, next.muted);
      });
    },
    [enqueue],
  );

  const setTunnelGain = useCallback((id: string, gain: number) => {
    setTunnels((ts) => ts.map((t) => (t.id === id ? { ...t, gain } : t)));
    const current = tunnelsRef.current.find((t) => t.id === id);
    if (current?.active) tauriAPI.setTunnelGain(id, gain);
  }, []);

  const setTunnelInputGain = useCallback(
    (id: string, inputIndex: number, gain: number) => {
      setTunnels((ts) =>
        ts.map((t) => {
          if (t.id !== id) return t;
          const inputs = t.inputs.map((inp, i) =>
            i === inputIndex ? { ...inp, gain } : inp,
          );
          return { ...t, inputs };
        }),
      );
      const current = tunnelsRef.current.find((t) => t.id === id);
      if (current?.active) tauriAPI.setTunnelInputGain(id, inputIndex, gain);
    },
    [],
  );

  const setTunnelInputPriority = useCallback(
    (id: string, inputIndex: number, priority: boolean) => {
      setTunnels((ts) =>
        ts.map((t) => {
          if (t.id !== id) return t;
          const inputs = t.inputs.map((inp, i) =>
            i === inputIndex ? { ...inp, priority } : inp,
          );
          return { ...t, inputs };
        }),
      );
      const current = tunnelsRef.current.find((t) => t.id === id);
      if (current?.active)
        tauriAPI.setTunnelInputPriority(id, inputIndex, priority);
    },
    [],
  );

  const setTunnelDucking = useCallback(
    (
      id: string,
      duckingEnabled: boolean,
      duckingAmount: number,
      duckingRelease: number,
    ) => {
      setTunnels((ts) =>
        ts.map((t) =>
          t.id !== id
            ? t
            : { ...t, duckingEnabled, duckingAmount, duckingRelease },
        ),
      );
      const current = tunnelsRef.current.find((t) => t.id === id);
      if (current?.active) {
        tauriAPI.setTunnelDucking(id, {
          enabled: duckingEnabled,
          amount: duckingAmount,
          release: duckingRelease,
        });
      }
    },
    [],
  );

  const renameTunnel = useCallback((id: string, name: string) => {
    setTunnels((ts) => ts.map((t) => (t.id === id ? { ...t, name } : t)));
  }, []);

  const reorderTunnels = useCallback((from: number, to: number) => {
    if (from === to) return;
    setTunnels((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  return {
    tunnels,
    setTunnels,
    tunnelsRef,
    togglingIds,
    addTunnel,
    deleteTunnel,
    updateTunnel,
    toggleTunnelActive,
    toggleTunnelMute,
    setTunnelGain,
    setTunnelInputGain,
    setTunnelInputPriority,
    setTunnelDucking,
    renameTunnel,
    reorderTunnels,
  };
}
