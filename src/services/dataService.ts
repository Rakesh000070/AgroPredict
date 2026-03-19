import Papa from 'papaparse';

export interface DatasetStats {
  stateAvg: number;
  districtAvgs: Record<string, number>;
  totalRecords: number;
}

export interface UniqueOptions {
  District: string[];
  Crop: string[];
  Season: string[];
  Soil_Type: string[];
  VarietiesByCrop: Record<string, string[]>;
}

export const fetchDatasetData = async (): Promise<{ stats: DatasetStats; options: UniqueOptions; rawData: any[] }> => {
  const response = await fetch('/odisha_realistic_dataset-1.csv');
  if (!response.ok) {
    throw new Error(`Failed to fetch dataset: ${response.statusText}`);
  }
  const csvText = await response.text();
  
  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as any[];
        
        // 1. Calculate Stats
        let totalYield = 0;
        let count = 0;
        const districtYields: Record<string, { sum: number, count: number }> = {};
        
        // 2. Extract Uniques
        const districts = new Set<string>();
        const crops = new Set<string>();
        const seasons = new Set<string>();
        const soilTypes = new Set<string>();
        const varietiesByCrop: Record<string, Set<string>> = {};
        
        data.forEach(row => {
          const yieldVal = row.Yield;
          const district = row.District;
          const crop = row.Crop;
          const season = row.Season;
          const soil = row.Soil_Type;
          const variety = row.Variety;
          
          if (typeof yieldVal === 'number' && !isNaN(yieldVal)) {
            totalYield += yieldVal;
            count++;
            if (district) {
              if (!districtYields[district]) districtYields[district] = { sum: 0, count: 0 };
              districtYields[district].sum += yieldVal;
              districtYields[district].count++;
            }
          }
          
          if (district) districts.add(district);
          if (crop) crops.add(crop);
          if (season) seasons.add(season);
          if (soil) soilTypes.add(soil);
          if (crop && variety) {
            if (!varietiesByCrop[crop]) varietiesByCrop[crop] = new Set();
            varietiesByCrop[crop].add(variety);
          }
        });
        
        const stateAvg = count > 0 ? totalYield / count : 0;
        const districtAvgs: Record<string, number> = {};
        for (const d in districtYields) {
          districtAvgs[d] = districtYields[d].count > 0 ? districtYields[d].sum / districtYields[d].count : 0;
        }
        
        const finalVarieties: Record<string, string[]> = {};
        for (const c in varietiesByCrop) {
          finalVarieties[c] = Array.from(varietiesByCrop[c]).sort();
        }
        
        resolve({
          stats: { stateAvg, districtAvgs, totalRecords: count },
          options: {
            District: Array.from(districts).sort(),
            Crop: Array.from(crops).sort(),
            Season: Array.from(seasons).sort(),
            Soil_Type: Array.from(soilTypes).sort(),
            VarietiesByCrop: finalVarieties
          },
          rawData: data
        });
      },
      error: (err) => reject(err)
    });
  });
};
