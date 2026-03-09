import {
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import type { Category, SubCategory } from "./types";

export function CategorySelectItems({ categories }: { categories: Category[] }) {
  const renderSubs = (subs: SubCategory[], depth: number) =>
    subs.map((s) => (
      <span key={s.id}>
        <SelectItem value={String(s.id)} className={depth === 1 ? "pl-7" : "pl-11"}>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.name}
          </span>
        </SelectItem>
        {s.subcategories && s.subcategories.length > 0 && renderSubs(s.subcategories, depth + 1)}
      </span>
    ));

  return (
    <>
      {categories.map((c) => (
        c.subcategories.length > 0 ? (
          <SelectGroup key={c.id}>
            <SelectItem value={String(c.id)}>
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                {c.name}
              </span>
            </SelectItem>
            {renderSubs(c.subcategories, 1)}
          </SelectGroup>
        ) : (
          <SelectItem key={c.id} value={String(c.id)}>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
              {c.name}
            </span>
          </SelectItem>
        )
      ))}
    </>
  );
}
