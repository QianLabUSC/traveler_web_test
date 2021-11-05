import * as _ from 'lodash';
import { NORMALIZED_WIDTH, RowType, transectLines, BATTERY_COST_PER_SAMPLE,
  BATTERY_COST_PER_DISTANCE, BATTERY_COST_PER_TRANSECT_DISTANCE, MAX_NUM_OF_MEASUREMENTS, sampleLocations } from './constants';
import { measurements } from './mesurements';
import { dataset } from './data/rhexDataset';
import { Transect, TransectType } from './types';
import { IState } from './state';

export const isProduction = () => {
  return process.env.MODE === 'production';
};

export function getDistanceSquare(x1: number, y1: number, x2: number, y2: number) {
  return (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
}

export function getDistance(x1: number, y1: number, x2: number, y2: number) {
  return Math.sqrt(getDistanceSquare(x1, y1, x2, y2));
}

// Return the nearest location, from 0 - 21
export function getNearestIndex(normOffsetXY : number[]) : number {
  const [offsetX, offsetY] = normOffsetXY; // these values are normOffsetX and normOffsetY from ClickableImage.tsx
  // If the distance square is larger than maxSquare, an error will pop up
  const maxSquare = 400;
  let start = 0, end = sampleLocations.length - 1;
  if (offsetX < sampleLocations[0][0]) {
    if (getDistanceSquare(offsetX, offsetY,
                          sampleLocations[0][0],
                          sampleLocations[0][1]) > maxSquare
    ) {
      return -1;
    }
    return 0;
  }
  if (offsetX > sampleLocations[sampleLocations.length - 1][0]) {
    if (getDistanceSquare(offsetX, offsetY,
                          sampleLocations[sampleLocations.length - 1][0],
                          sampleLocations[sampleLocations.length - 1][1]) > maxSquare
    ) {
      return -1;
    }
    return sampleLocations.length - 1;
  }
  // Use binary search to find the first x coordinate that is smaller than offsetX
  let mid;
  while (start < end) {
    mid = Math.floor((start + end) / 2);
    const midX = sampleLocations[mid][0];
    const midNext = mid + 1 === sampleLocations.length - 1 ? NORMALIZED_WIDTH : sampleLocations[mid + 1][0];
    if (offsetX >= midX && offsetX < midNext) {
      break;
    } else if (offsetX < midX) {
      end = mid;
    } else if (offsetX >= midNext) {
      start = mid + 1;
    }
  }
  // We compare between mid and mid + 1 to see which one is the closest
  const dist1 = getDistanceSquare(offsetX, offsetY, sampleLocations[mid][0], sampleLocations[mid][1]);
  const dist2 = getDistanceSquare(offsetX, offsetY, sampleLocations[mid + 1][0], sampleLocations[mid + 1][1]);
  // Since the actual index is offset by 1, we change mid and mid + 1 to mid + 1 and mid + 2
  if (Math.min(dist1, dist2) > maxSquare) {
    return -1;
  }
  return dist1 < dist2 ? mid : mid + 1;
}

function getTransectCost(ta: Transect, tb: Transect) : number {
  const la = transectLines[ta.number], lb = transectLines[tb.number];
  const midA = [(la.from[0] + la.to[0]) / 2, (la.from[1] + la.to[1]) / 2];
  const midB = [(lb.from[0] + lb.to[0]) / 2, (lb.from[1] + lb.to[1]) / 2];
  return getDistance(midA[0], midA[1], midB[0], midB[1]) * BATTERY_COST_PER_TRANSECT_DISTANCE;
}

function getRowCost(ra: IRow, rb: IRow) : number {
  return getDistance(ra.normOffsetX, ra.normOffsetY, rb.normOffsetX, rb.normOffsetY) * BATTERY_COST_PER_DISTANCE;
}

export function getBatteryCost(transectIndices: Transect[], transectSamples: IRow[][],
                 curTransectIdx?: number, curRowIdx?: number) : number
{
  let cost = 0;
  let lastNonDiscardTransect = -1;
  const transectMax = curTransectIdx === undefined ? transectIndices.length : curTransectIdx + 1;
  
  for (let i = 0; i < transectMax; i++) {
    const transect = transectIndices[i];
    if (transect.type === TransectType.DISCARDED) {
      continue;
    }
    if (lastNonDiscardTransect > -1) {
      cost += getTransectCost(transectIndices[lastNonDiscardTransect], transectIndices[i]);
    }
    const samples = transectSamples[i];
    const sampleMax =
      (curRowIdx !== undefined && i === curTransectIdx && transect.type !== TransectType.DEVIATED) ?
      curRowIdx : samples.length;
    let lastNonDiscardRow = -1;
    for (let j = 0; j < sampleMax; j++) {
      if (samples[j].type === RowType.DISCARDED) {
        continue;
      }
      cost += samples[j].measurements * BATTERY_COST_PER_SAMPLE;
      if (lastNonDiscardRow > -1) {
        cost += getRowCost(samples[lastNonDiscardRow], samples[j]);
      }
      lastNonDiscardRow = j;
    }
    lastNonDiscardTransect = i;
  }
  return cost;
}

// Function to load moisture data (there is only 1 moisture dataset - called in strategy.tsx
export function getMoistureData() {
  // There is only 1 moisture dataset
  return dataset.moisture;
}

// Function to load grain data (global hypothesis) - called in geo.tsx
export function getGrainData(dataVersionGlobal: number) {
  if (dataVersionGlobal === 1) return dataset.grain1;
  return dataset.grain2;
}

// Function to load shear data (local hypothesis) - called in geo.tsx
export function getShearData(dataVersionLocal: number) {
  if (dataVersionLocal === 1) return dataset.shear0; 
  return dataset.shear1;
}

export function getRandomMeasurements(isAlternativeHypo = false) {
  // Clone a copy of data
  const { y_H0, y_H1 } = measurements;
  const data = _.cloneDeep(isAlternativeHypo ? y_H1 : y_H0);
  for (let loc = 0; loc < data.length; loc++) {
    // Shuffle the order of measurements for each location
    for (let i = data[loc].length - 1; i >= 0; i--) {
      const rand = Math.round(Math.random() * i);
      const temp = data[loc][i];
      data[loc][i] = data[loc][rand];
      data[loc][rand] = temp;
    };
  }
  return data;
}

export function getBasename() {
  return window.location.host.startsWith('localhost') ? '' : '/~shenyuec';
}

// Get the number of measurements for a index until untilIndex
export function getNOMTaken(rows: IRow[], index, untilIndex = rows.length) {
  let sum = 0;
  for (let i = 0; i < untilIndex; i++) {
    if (rows[i].index === index && rows[i].type !== RowType.DISCARDED) {
      sum += rows[i].measurements;
    }
  }
  return sum;
}

export function cloneRow(row: IRow) : IRow {
  const clone: IRow = {
    index: row.index,
    measurements: row.measurements,
    type: row.type,
    normOffsetX: row.normOffsetX,
    normOffsetY: row.normOffsetY,
    isHovered: row.isHovered,
    moisture: row.moisture,
    shear: row.shear
  };
  return clone;
}

/**
 * Used in the scenario where you deviate and attempt to take more measurements
 * that would surpass 100% battery usage if your planned strategy was still
 * completed. Works from the last measurement to the first, removing samples
 * until the deviated measurements and the planned strategy fit within the 
 * battery constraint. Returns the array of samples for each transect.
 * 
 * Parameter batteryCost is the total battery usage, presumably over 100%.
 * 
 */
export function trimSamplesByBatteryUsage(batteryCost: number, transectSamples: IRow[][]) : IRow[][] {
  let extraCost = batteryCost - 1;
  const newSamples: IRow[][] = [];
  for (let i = 0; i < transectSamples.length; i++) {
    newSamples.push(new Array<IRow>());
  }

  for (let transectIndex = transectSamples.length - 1; transectIndex >= 0; transectIndex--) {
    for (let location = transectSamples[transectIndex].length - 1; location >= 0; location--) {
      const measurements = transectSamples[transectIndex][location].measurements;
      const cost = measurements * BATTERY_COST_PER_SAMPLE;

      if (extraCost <= 0) {
        // For all rows before the ones that need to be reduced, copy them over in full.
        newSamples[transectIndex].unshift(cloneRow(transectSamples[transectIndex][location]));
      } else if (extraCost - cost > 0) {
        // Remove all of these measurements
        const newRow: IRow = cloneRow(transectSamples[transectIndex][location]);
        extraCost -= newRow.measurements * BATTERY_COST_PER_SAMPLE;
        newRow.measurements = 0;
        // 
        // newSamples[transectIndex].unshift(newRow);
      } else {
        // Remove a portion of these measurements
        const measurementsToRemove = Math.ceil(extraCost / BATTERY_COST_PER_SAMPLE);
        const newRow: IRow = cloneRow(transectSamples[transectIndex][location]);
        newRow.measurements = newRow.measurements - measurementsToRemove;
        newSamples[transectIndex].unshift(newRow);
        extraCost -= measurementsToRemove * BATTERY_COST_PER_SAMPLE;
      }
    }
  }

  while (newSamples[newSamples.length - 1].length === 0) {
    newSamples.pop();
  }

  return newSamples;
}

export function RGBAtoRGB(color: number[], backgroundColor: number[]) : number[] {
  if (color.length < 4) return color;
  const a = color[3];
  return [
    (1 - a) * backgroundColor[0] + a * color[0],
    (1 - a) * backgroundColor[1] + a * color[1],
    (1 - a) * backgroundColor[2] + a * color[2]
  ];
}

export function randomInt(max: number) : number {
  return Math.floor(Math.random() * Math.floor(max));
}

export function mean(a: number[]) :  number {
  if (a.length === 0) return 0;
  return a.reduce((acc, v) => acc + (v ? v : 0), 0) / a.length;
}

export function getVector2Angle(v: number[]) : number {
  return Math.atan2(v[1], v[0]);
}

// MurmurHash3 hashing function
function xmur3(str) {
  for(var i = 0, h = 1779033703 ^ str.length; i < str.length; i++)
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353),
      h = h << 13 | h >>> 19;
  return function() {
      h = Math.imul(h ^ h >>> 16, 2246822507);
      h = Math.imul(h ^ h >>> 13, 3266489909);
      return (h ^= h >>> 16) >>> 0;
  }
}

// Mulberry32 random number generator
function mulberry32(a) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

function createRNG(seedString) {
  const seed = xmur3(seedString);
  return mulberry32(seed());
}

// This function is where the shear, moisture, and grain data is determined based on the user sample inputs.
// The transectIndex is also transect id. Location index is the value in [0, 21] for the position of the sample 
// on the curve. Measurements is the number of measurements taken at that point.
export function getMeasurements(globalState: IState, transectIndex: number, locationIndex: number, measurements: number) {
  const { fullData, moistureData, grainData } = globalState;
  const transectGroup = Math.floor(transectIndex / 3);
  // Should seed include the current number of measurements taken?
  const seed = `${transectIndex}${measurements}`;
  const rng = createRNG(seed);
  const shearValues: number[] = [];
  const moistureValues: number[] = [];
  const grainValues: number[] = [];
  const shearMoistureValues: {shearValue: number, moistureValue: number}[] = [];

  for (let i = 0; i < measurements; i++) {
    const j = Math.floor(rng() * MAX_NUM_OF_MEASUREMENTS);
    //console.log({transectIndex, locationIndex, measurements, j}); // for debugging
    shearValues.push(fullData[transectGroup][locationIndex][j]);
    moistureValues.push(moistureData[transectGroup][locationIndex][j]);
    grainValues.push(grainData[transectGroup][locationIndex][j]);
    shearMoistureValues.push({shearValue: fullData[transectGroup][locationIndex][j], moistureValue: moistureData[transectGroup][locationIndex][j]});
  }
  //console.log({shearValues, moistureValues, grainValues, shearMoistureValues}); // for debugging
  return {shearValues, moistureValues, grainValues, shearMoistureValues};
}

// This function parses the URL to determine whether the original or robotic version of the website will be used
// Original version with manual execution of strategy: https://www.seas.upenn.edu/~foraging/field/dev/#/
// New version with robotic suggested execution of strategy: https://www.seas.upenn.edu/~foraging/field/dev/#/?v=1
export function parseQueryString(query: string) {
  if (!query || !query.length) return {};
  if (query.startsWith('?')) query = query.substring(1);
  const blocks = query.split('&');
  let queryParams = {};
  blocks.forEach(block => {
    const i = block.indexOf('=');
    if (i === -1) queryParams[block] = null;
    if (i === 0) return;
    queryParams[decodeURI(block.substring(0, i))] = decodeURI(block.substring(i + 1));
  });
  return queryParams;
}
