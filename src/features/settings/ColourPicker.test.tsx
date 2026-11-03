import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColourPicker } from "./ColourPicker";

afterEach(cleanup);

describe("Colour picker (U-10)", () => {
  it("offers exactly five colours, Periwinkle marked as the default, and shows the one in use", () => {
    render(<ColourPicker value="indigo" onChange={() => {}} />);
    const group = screen.getByRole("radiogroup", { name: "Colour" });
    expect(group.querySelectorAll("[role=radio]")).toHaveLength(5);
    expect(screen.getByRole("radio", { name: "Periwinkle" }).textContent).toContain("Default");
    expect(screen.getByRole("radio", { name: "Twilight Indigo" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Copper" }).getAttribute("aria-checked")).toBe("false");
  });

  it("with nothing saved yet, Periwinkle is the one in use, and a click picks another", () => {
    const pick = vi.fn();
    render(<ColourPicker value={undefined} onChange={pick} />);
    expect(screen.getByRole("radio", { name: "Periwinkle" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Ultraviolet" }));
    expect(pick).toHaveBeenCalledWith("ultraviolet");
  });
});
