import { invoke } from "@tauri-apps/api";
import { listen } from "@tauri-apps/api/event";
import { appWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { useSide } from "../provider/SideContext";

export default function Titlebar() {
  const [isScaleup, setScaleup] = useState(false);
  const { toggleSide } = useSide();

  const onMinimize = () => appWindow.minimize();
  const onScaleup = () => {
    appWindow.toggleMaximize();
    setScaleup(true);
  };

  const onScaledown = () => {
    appWindow.toggleMaximize();
    setScaleup(false);
  };

  function openTerminal() {
    const project = localStorage.getItem("project") || "/";
    invoke("open_terminal", { directory: project });
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    const html = document.querySelector("html");
    const theme = localStorage.getItem("theme");

    const themeChange = listen("theme", () => {
      setTheme();
    });
    const swapChange = listen("swap", () => {
      toggleSide();
    });

    if (theme === "dark") {
      html?.setAttribute("data-theme", "dark");
    } else {
      html?.setAttribute("data-theme", "light");
    }

    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "q") {
        e.preventDefault();
        appWindow.close();
      } else if (e.metaKey && e.key === "m") {
        e.preventDefault();
        appWindow.minimize();
      }
    });

    return () => {
      window.removeEventListener("keydown", () => {});
      swapChange.then((fn) => fn());
      themeChange.then((fn) => fn());
    };
  }, []);

  const setTheme = () => {
    const html = document.querySelector("html");

    if (html?.getAttribute("data-theme") === "dark") {
      html.setAttribute("data-theme", "light");
      localStorage.setItem("theme", "light");
    } else {
      html?.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
    }
  };

  const onClose = () => appWindow.close();

  return (
    <div
      id="titlebar"
      data-tauri-drag-region
      className="flex justify-between px-3 py-2 items-center flex-row"
    >
      <div className="flex gap-[32px] items-center">
        <div className="titlebar-actions h-3 flex gap-[8px]">
          <span
            id="ttb-close"
            className="titlebar-icon w-3 h-3 rounded-full bg-red cursor-pointer"
            onClick={onClose}
            onKeyDown={(e) => {
              if (e.metaKey && e.key === "q") {
                onClose();
              }
            }}
          />

          <span
            className="titlebar-icon w-3 h-3 rounded-full bg-yellow cursor-pointer"
            onClick={onMinimize}
            onKeyDown={(e) => {
              if (e.metaKey && e.key === "m") {
                onMinimize();
              }
            }}
          />

          <span
            className="titlebar-icon w-3 h-3 rounded-full bg-green cursor-pointer"
            onKeyDown={(e) => {
              if (e.metaKey && e.key === "f") {
                isScaleup ? onScaledown() : onScaleup();
              }
            }}
            onClick={isScaleup ? onScaledown : onScaleup}
          />
        </div>

        <div className="flex gap-[6px] items-center">
          <button
            type="button"
            className="px-2 py-1 rounded-lg text-xs hover:bg-light"
            onClick={() =>
              document.querySelector<HTMLButtonElement>("#folder-open")?.click()
            }
          >
            Open
          </button>

          <button
            type="button"
            className="px-2 py-1 rounded-lg text-xs hover:bg-light"
            onClick={() => openTerminal()}
          >
            Terminal
          </button>

          <button
            type="button"
            className="px-2 py-1 rounded-lg text-xs hover:bg-light"
            onClick={() => toggleSide()}
          >
            Swap
          </button>

          <button
            type="button"
            className="px-2 py-1 rounded-lg text-xs hover:bg-light"
            onClick={() => setTheme()}
          >
            Theme
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 5 pl-2 w-[24px] h-[24px]">
        <svg
          aria-label="logo"
          role="img"
          width="512"
          height="512"
          viewBox="0 0 512 512"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M166.009 294.914C200.98 325.865 251.221 347.105 255.955 349.078L232.285 404L170.438 342.554C163.26 335.423 160.054 325.106 162.039 315.093L166.009 294.914ZM328.645 264.873C328.645 264.873 304.975 208.13 272.143 175.511C189.679 93.5824 125.236 107.237 110.728 111.637C106.147 126.05 92.5559 190.076 175.019 272.004C207.852 304.624 264.965 328.14 264.965 328.14L328.645 264.873ZM295.202 166.559C326.354 201.303 347.734 251.219 349.719 255.922L405 232.405L343.153 170.959C335.975 163.828 325.591 160.642 315.512 162.615L295.202 166.559ZM206.477 237.109C189.679 237.109 175.935 223.454 175.935 206.765C175.935 190.076 189.679 176.421 206.477 176.421C223.275 176.421 237.019 190.076 237.019 206.765C237.019 223.454 223.275 237.109 206.477 237.109Z"
            fill="#CED3EF"
          />
          <path
            d="M376.291 311.148C368.044 302.955 356.591 297.797 343.916 297.797C334.848 297.775 325.978 300.432 318.433 305.429C310.887 310.426 305.006 317.538 301.537 325.862C298.068 334.186 297.167 343.346 298.948 352.18C300.729 361.014 305.113 369.123 311.542 375.477C329.561 393.38 405 404 405 404C405 404 394.31 329.051 376.291 311.148Z"
            fill="url(#paint0_linear_11_64)"
          />
          <defs>
            <linearGradient
              id="paint0_linear_11_64"
              x1="351.528"
              y1="297.796"
              x2="351.528"
              y2="404"
              gradientUnits="userSpaceOnUse"
            >
              <stop stop-color="#FF8D4E" />
              <stop offset="1" stop-color="#FF3F15" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}
