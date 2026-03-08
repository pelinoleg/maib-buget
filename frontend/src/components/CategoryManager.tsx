import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getCategories,
  getCategoryRules,
  getPendingRules,
  getTypeRules,
} from "@/lib/api";
import type { Category, Rule, TypeRuleData } from "./categories/types";
import CategoriesTab from "./categories/CategoriesTab";
import RulesTab from "./categories/RulesTab";
import PendingRulesTab from "./categories/PendingRulesTab";
import TypeRulesTab from "./categories/TypeRulesTab";

export default function CategoryManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [pendingRules, setPendingRules] = useState<Rule[]>([]);
  const [typeRules, setTypeRules] = useState<TypeRuleData[]>([]);
  const [aiStatus, setAiStatus] = useState(""); // kept for RulesTab/PendingRulesTab

  const reload = () => {
    getCategories().then(setCategories).catch(() => {});
    getCategoryRules().then(setRules).catch(() => {});
    getPendingRules().then(setPendingRules).catch(() => {});
    getTypeRules().then(setTypeRules).catch(() => {});
  };

  useEffect(reload, []);

  const topCategories = categories.filter((c) => !c.parent_id);

  return (
    <div className="space-y-6 md:max-w-3xl md:mx-auto">
      <h1 className="hidden md:block text-2xl font-bold">Categorii</h1>

      <Tabs defaultValue="categories">
        <TabsList className="flex flex-wrap gap-1.5 bg-transparent p-0 !h-auto">
          <TabsTrigger value="categories" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md border border-border px-3 py-1.5 text-sm">Categorii ({topCategories.length})</TabsTrigger>
          <TabsTrigger value="rules" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md border border-border px-3 py-1.5 text-sm">Reguli ({rules.length})</TabsTrigger>
          {pendingRules.length > 0 && (
            <TabsTrigger value="pending" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md border border-border px-3 py-1.5 text-sm">
              De verificat
              <Badge variant="destructive" className="ml-1.5 text-[10px] px-1.5 py-0">{pendingRules.length}</Badge>
            </TabsTrigger>
          )}
          <TabsTrigger value="type-rules" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md border border-border px-3 py-1.5 text-sm">Reguli tip ({typeRules.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="categories">
          <CategoriesTab categories={categories} reload={reload} />
        </TabsContent>

        <TabsContent value="rules">
          <RulesTab categories={categories} rules={rules} reload={reload} setAiStatus={setAiStatus} />
        </TabsContent>

        {pendingRules.length > 0 && (
          <TabsContent value="pending">
            <PendingRulesTab categories={categories} pendingRules={pendingRules} reload={reload} setAiStatus={setAiStatus} />
          </TabsContent>
        )}

        <TabsContent value="type-rules">
          <TypeRulesTab typeRules={typeRules} reload={reload} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
