import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RichBody } from "./RichBody";
import { checkCount } from "./format";

afterEach(cleanup);

describe("RichBody (U-1)", () => {
  it("a ticked box moves below the open ones (like Google Keep) and the note saves as Markdown", async () => {
    const onChange = vi.fn();
    render(<RichBody value={"- [ ] milk\n- [ ] eggs\n- [ ] bread"} onChange={onChange} />);
    const box = (await screen.findAllByRole("checkbox"))[0] as HTMLInputElement;
    await act(async () => { box.click(); });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const md = onChange.mock.calls.at(-1)?.[0] as string;
    expect(md.split("\n").filter(Boolean)).toEqual(["- [ ] eggs", "- [ ] bread", "- [x] milk"]);
    expect(await screen.findByRole("button", { name: "Done (1)" })).toBeTruthy();
  });

  it("opening a note does not rewrite it", async () => {
    const onChange = vi.fn();
    render(<RichBody value={"Some _text_ and\n\n* a star list"} onChange={onChange} />);
    await screen.findByRole("textbox", { name: "Note" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a note written one thing per line keeps its lines, and saves back the same text", async () => {
    const onChange = vi.fn();
    const { container } = render(<RichBody value={"Oats\nPeanut butter\nBananas"} onChange={onChange} />);
    await screen.findByRole("textbox", { name: "Note" });
    expect(container.querySelectorAll(".ProseMirror br").length).toBe(2);
    const box = (await screen.findAllByRole("textbox", { name: "Note" }))[0] as HTMLElement;
    expect(box.textContent).toBe("OatsPeanut butterBananas");
  });

  it("after an edit, line breaks are saved as plain line breaks (no backslashes or extra spaces)", async () => {
    const onChange = vi.fn();
    render(<RichBody value={"Oats\nPeanut butter\n\n- [ ] milk"} onChange={onChange} />);
    const box = (await screen.findAllByRole("checkbox"))[0] as HTMLInputElement;
    await act(async () => { box.click(); });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls.at(-1)?.[0]).toBe("Oats\nPeanut butter\n\n- [x] milk");
  });

  it("counts boxes for the progress line", () => {
    expect(checkCount("- [x] a\n- [ ] b\n  * [X] c\ntext")).toEqual({ done: 2, total: 3 });
  });
});
