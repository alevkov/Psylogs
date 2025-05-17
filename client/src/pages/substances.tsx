import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import articlesData from "../lib/articles_refined.json";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";

interface SubstanceData {
  id: number;
  title: string;
  drug_info: {
    drug_name: string;
    categories: string[];
  };
}

// Helper function to parse the drug name and extract main name and alternatives
const parseDrugName = (
  drugName: string,
): { mainName: string; alternatives: string | null } => {
  // Check if there are alternative names in parentheses
  const match = drugName.match(/^(.*?)\s*\((.*?)\)$/);

  if (match) {
    return {
      mainName: match[1].trim(),
      alternatives: match[2].trim(),
    };
  }

  // No alternatives found
  return {
    mainName: drugName,
    alternatives: null,
  };
};

export default function SubstancesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [substances, setSubstances] = useState<SubstanceData[]>([]);

  useEffect(() => {
    // Cast the imported data to the expected type
    const typedData = articlesData as SubstanceData[];

    // Sort the substances alphabetically by the main name
    const sortedData = [...typedData].sort((a, b) => {
      const mainNameA = parseDrugName(
        a.drug_info.drug_name,
      ).mainName.toLowerCase();
      const mainNameB = parseDrugName(
        b.drug_info.drug_name,
      ).mainName.toLowerCase();
      return mainNameA.localeCompare(mainNameB);
    });

    setSubstances(sortedData);
  }, []);

  const filteredSubstances = substances.filter((substance) => {
    const searchLower = searchTerm.toLowerCase();

    // Search in the title, drug_name and any aliases in the title
    return (
      substance.title.toLowerCase().includes(searchLower) ||
      substance.drug_info.drug_name.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="container mx-auto">
      <div className="mb-4 relative">
        <Input
          type="text"
          placeholder="Search substances"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full"
        />
        {searchTerm && (
          <button
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500"
            onClick={() => setSearchTerm("")}
          >
            ✕
          </button>
        )}
      </div>

      {/* Substance list */}
      <div className="space-y-2">
        {filteredSubstances.map((substance) => {
          const { mainName, alternatives } = parseDrugName(
            substance.drug_info.drug_name,
          );

          return (
            <Link key={substance.id} href={`/substances/${substance.id}`}>
              <div className="border-b py-2 px-3 cursor-pointer">
                <div className="flex items-center">
                  <h4 className="font-semibold ml-2">{mainName}</h4>
                  {alternatives && (
                    <h5 className="text-gray-500 dark:text-gray-400 text-xs ml-2 pb-4">
                      {alternatives.split(", ").join(" / ")}
                    </h5>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {substance.drug_info.categories.map((category, idx) => (
                    <Badge
                      key={idx}
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0"
                    >
                      {category}
                    </Badge>
                  ))}
                </div>
              </div>
            </Link>
          );
        })}

        {filteredSubstances.length === 0 && (
          <div className="text-center py-10">
            <p className="text-gray-500">
              No substances found matching "{searchTerm}"
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
