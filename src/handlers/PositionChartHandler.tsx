import { getMeasurements, mean } from '../util';
import { shearChartOption, moistChartOption, shearMoistChartOption, NORMALIZED_CREST_RANGE, INDEX_LENGTH, SCALAR_X_VAL, positionChartOption } from '../constants';
// TODO add positionChartOption to above
import { IState, Action, Charts, ChartDisplayMode } from '../state';
import * as Chart from 'chart.js';

export enum ChartLocation { Field, Transect }

export const updateCharts = (globalState: IState, dispatch: any) => {
  const { chartSettings, currSampleIdx, samples, transectIdx } = globalState;
  let { chart } = globalState;
  if (!chart) return;
  clearCharts(chart);
  chart = initializeCharts(globalState, dispatch);

  if (chart === null) {
    return;
  }

  const shearDataPoints = [] as any[];

  // IDK what this does
  for (let rowIndex = 0; rowIndex < samples.length; rowIndex++) {
    const row = samples[rowIndex];
    const { index, moisture, shear } = row;

    // Map x value from just the section of the slope to [0, 1]
    // const xVal = SCALAR_X_VAL * (row.index) / INDEX_LENGTH;
    const xVal = 10 + 6 * row.index;
    console.log("Current Index: ", row.index);
    console.log("Current xVal: ", xVal);
    console.log("\n");
    // const xVal = (row.normOffsetX - NORMALIZED_CREST_RANGE.min) / (NORMALIZED_CREST_RANGE.max - NORMALIZED_CREST_RANGE.min);
    //const { shearValues, moistureValues, shearMoistureValues } = getMeasurements(globalState, transectIdx, index, measurements);
    const averageShearValue = mean(shear);
    const averageMoistureValue = mean(moisture);

    if (chartSettings.mode === ChartDisplayMode.RAW) {
      shear.forEach(value => pushChartArrayValue(shearDataPoints, Math.min(xVal, SCALAR_X_VAL), value, rowIndex, currSampleIdx, index));
    } else if (chartSettings.mode === ChartDisplayMode.AVERAGE) {
      pushChartArrayValue(shearDataPoints, Math.min(xVal, SCALAR_X_VAL), averageShearValue, rowIndex, currSampleIdx,index);
    }
  }
  

  if (chart.shearChart) {
    chart.shearChart.data.datasets[0].data = shearDataPoints;
  } else {
  }

  if (chart.shearChartMap) {
    chart.shearChartMap.data.datasets[0].data = shearDataPoints;
  } else {
    //console.log("chart.shearChartMap undefined");
  }

  Object.values(chart).forEach(c => c?.update());  
}

export const initializeCharts = (globalState: IState, dispatch: any) : Charts => {

  let { chart } = globalState;
  try {
    clearCharts(chart);
  } catch (e) {
    console.log(e);
  }

  // Recursively apply function to array
  const apply = (f, v) => Array.isArray(v) ? f(...v.map(vi => apply(f, vi))) : v;

  const { fullData, moistureData } = globalState;
  positionChartOption.options.scales.xAxes[0].ticks = { min: 0, max: 1, stepSize: 0.1 }; // CHART IMAGE X AXIS TICKS FOR DISTANCE
  positionChartOption.options.scales.yAxes[0].ticks = { min: 0, max: 0 };

  shearChartOption.options.scales.xAxes[0].ticks = { min: 0, max: 140 }; // CHART IMAGE X AXIS TICKS FOR DISTANCE
  shearChartOption.options.scales.yAxes[0].ticks = { min: 0, max: 8 };

  const onHoverFunc = (ev, activeElements) => {
    if (activeElements.length === 0) {
      dispatch({
        type: Action.SET_HOVER,
        value: { isHovered: false }
      });
      return;
    }
    const {_datasetIndex, _index, _chart} = activeElements[0];
    if (_datasetIndex === undefined || _index === undefined ) { return; }
    const rowIndex = _chart.data.datasets[_datasetIndex].data[_index].rowIndex;
    dispatch({
      type: Action.SET_HOVER,
      value: { index: rowIndex, isHovered: true }
    });
  };

  let shearChart: any, moistChart: any, shearMoistChart: any, 
      shearChartMap: any, moistChartMap: any, shearMoistChartMap: any, positionChart: any, positionChartMap: any;

  // Assume that if one chart is in DOM, the others also are.
  if (document.getElementById('positionChart')) {
    const positionCtx = (document.getElementById('positionChart') as HTMLCanvasElement).getContext('2d');
    if (positionCtx) {
        positionChart = new Chart(positionCtx, positionChartOption as any);
    }
  }
  if (document.getElementById('shearChart')) {
    const shearCtx = (document.getElementById('shearChart') as HTMLCanvasElement).getContext('2d');
    const moistCtx = (document.getElementById('moistChart') as HTMLCanvasElement).getContext('2d');
    const shearMoistCtx = (document.getElementById('shearMoistChart') as HTMLCanvasElement).getContext('2d');

    if (shearCtx) {
      shearChart = new Chart(shearCtx, shearChartOption as any);
    }
  }

  if (document.getElementById('shearChartMap')) {
    const shearMapCtx = (document.getElementById('shearChartMap') as HTMLCanvasElement).getContext('2d');
  }

  const charts : Charts = {
    shearChart, moistChart, shearMoistChart, shearChartMap, moistChartMap, shearMoistChartMap, positionChart, positionChartMap
  };
  dispatch({
    type: Action.SET_CHART,
    value: charts
  });
  return charts;
}

export const clearCharts = (chart) => {
  resetCanvas(); // reset the chart canvases
  if (!chart) return;
  Object.values(chart).forEach((c: any) => {
    if (!c) return; 
    c.destroy();
  });
}

const pushChartArrayValue = (array: any[], x, y, rowIndex, curRowIdx, index) => {
  if ((!x && isNaN(x)) || (!y && isNaN(y))) {
    console.log(`ChartHandler: not adding point (${x}, ${y})`);
    return;
  }
  array.push({
    x,
    y,
    rowIndex,
    curRowIdx,
    hover: false,
    index
  });
}

// This function resets the chart canvases by removing and then recreating & reappending them to their parent divs.
// This function was added to resolve a bug where old chart data would sometimes flash back up when the mouse hovers over it.
// It is called in the "clearCharts" function above.
var resetCanvas = function(){
  document.getElementById('shearChart')?.remove();
  document.getElementById('positionChart')?.remove();

  let canvasShear = document.createElement('canvas');
  let canvasPosition = document.createElement('canvas');
  canvasPosition.id='positionChart';
  canvasShear.id = 'shearChart';
  document.getElementById('shearChartParent')?.appendChild(canvasShear);
  document.getElementById('positionChartParent')?.appendChild(canvasPosition);
};

