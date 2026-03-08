import {
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import type { Category } from "./types";

export function CategorySelectItems({ categories }: { categories: Category[] }) {
  const topCategories = categories.filter((c) => !c.parent_id);
  return (
    <>
      {topCategories.map((c) => (
        c.subcategories.length > 0 ? (
          <SelectGroup key={c.id}>
            <SelectItem value={String(c.id)}>
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                {c.name}
              </span>
            </SelectItem>
            {c.subcategories.map((s) => (
              <SelectItem key={s.id} value={String(s.id)} className="pl-7">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                </span>
              </SelectItem>
            ))}
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
