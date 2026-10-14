import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { RailCollapse } from "../components/rail-collapse";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("measures asynchronous content, reverses collapse and disconnects its resize observer", () => {
  let height = 48, notify!: ResizeObserverCallback;
  const disconnect = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ height }) as DOMRect);
  vi.stubGlobal("ResizeObserver", class { constructor(callback: ResizeObserverCallback) { notify = callback; } observe() {} disconnect = disconnect; });
  const view = render(<RailCollapse id="bots" collapsed={false}><button>Bot</button></RailCollapse>);
  const content = document.getElementById("bots")!;
  expect(content.style.height).toBe("48px");
  height = 192; act(() => notify([], {} as ResizeObserver));
  expect(content.style.height).toBe("192px");
  view.rerender(<RailCollapse id="bots" collapsed><button>Bot</button></RailCollapse>);
  expect(content.style.height).toBe("0px"); expect(content.hasAttribute("inert")).toBe(true);
  height = 96; act(() => notify([], {} as ResizeObserver));
  expect(content.style.height).toBe("0px");
  view.rerender(<RailCollapse id="bots" collapsed={false}><button>Bot</button></RailCollapse>);
  expect(content.style.height).toBe("96px"); expect(content.hasAttribute("inert")).toBe(false);
  view.unmount(); expect(disconnect).toHaveBeenCalledOnce();
});
