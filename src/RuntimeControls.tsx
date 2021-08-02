import React, { useCallback, useMemo, useState } from 'react';
import ControlPanel from 'react-control-panel';
import { UnreachableException } from 'ameo-utils';

import { NNContext } from './NNContext';
import { ResponseMatrix } from './Charts/ResponseViz';
import { ResponseViz, CostsPlot } from './Charts';
import './RuntimeControls.css';
import { useReducer } from 'react';

interface OutputData {
  responseMatrix: ResponseMatrix;
  costs: number[];
}

interface OutputDataDisplayProps extends OutputData {
  nnCtx: NNContext;
  sourceFn: (inputs: Float32Array) => Float32Array;
}

const OutputDataDisplay: React.FC<OutputDataDisplayProps> = ({
  nnCtx,
  responseMatrix,
  sourceFn,
  costs,
}) => {
  return (
    <div className='charts'>
      <ResponseViz nnCtx={nnCtx} data={responseMatrix} sourceFn={sourceFn} inputRange={[0, 1]} />
      <CostsPlot costs={costs} />
    </div>
  );
};

interface RuntimeControlsProps {
  nnCtx: NNContext;
}

enum SourceFnType {
  Ternary1,
  Multiply,
  Max,
  Min,
  ComplexFancy,
  Discretize,
}

const buildSourceFn = (fnType: SourceFnType) => {
  switch (fnType) {
    case SourceFnType.Ternary1:
      return (inputs: Float32Array) =>
        new Float32Array([inputs[0] > 0.5 || inputs[1] > inputs[0] ? 1 : 0]);
    case SourceFnType.Multiply:
      return (inputs: Float32Array) => new Float32Array([inputs[0] * inputs[1]]);
    case SourceFnType.Max:
      return (inputs: Float32Array) => new Float32Array([Math.max(inputs[0], inputs[1])]);
    case SourceFnType.Min:
      return (inputs: Float32Array) => new Float32Array([Math.min(inputs[0], inputs[1])]);
    case SourceFnType.ComplexFancy:
      return (inputs: Float32Array) => {
        const [a, b] = [inputs[0], inputs[1]];

        const val =
          a < 0.1 || b < 0.1 || a > 0.9 || b > 0.9
            ? Math.max(a, b)
            : Math.abs(Math.sin(inputs[0] * 6)) * Math.abs(Math.sin(inputs[1] * 6));
        return new Float32Array([val]);
      };
    default:
      throw new UnreachableException();
  }
};

const buildSettings = (
  nnCtx: NNContext,
  sourceFn: (inputs: Float32Array) => Float32Array,
  setOutputData: (action: { responseMatrix: ResponseMatrix; costs: Float32Array | null }) => void
) => [
  {
    type: 'select',
    label: 'target functions',
    options: {
      'a > 0.5 || b > a ? 1 : 0': SourceFnType.Ternary1,
      'a * b': SourceFnType.Multiply,
      'max(a, b)': SourceFnType.Max,
      'min(a, b)': SourceFnType.Min,
      'fancy sine thing': SourceFnType.ComplexFancy,
    },
    initial: SourceFnType.ComplexFancy,
  },
  {
    type: 'button',
    label: 'reset',
    action: async () => {
      if (nnCtx.isRunning) {
        return;
      }

      setOutputData({ responseMatrix: [], costs: null });
      await nnCtx.uninit();
    },
  },
  {
    type: 'button',
    label: 'train 1 million examples',
    action: async () => {
      if (nnCtx.isRunning) {
        return;
      }

      if (!(await nnCtx.getIsInitialized())) {
        await nnCtx.init(nnCtx.definition);
      }

      nnCtx.isRunning = true;
      let costs = await nnCtx.trainWithSourceFunction(sourceFn, 1_000, [0, 1]);

      const responseMatrix = await nnCtx.computeResponseMatrix(80, [0, 1]);
      setOutputData({ responseMatrix, costs });

      for (let i = 0; i < 20; i++) {
        costs = await nnCtx.trainWithSourceFunction(sourceFn, 50_000, [0, 1]);

        const responseMatrix = await nnCtx.computeResponseMatrix(80, [0, 1]);
        setOutputData({ responseMatrix, costs });
      }

      nnCtx.isRunning = false;
    },
  },
  {
    type: 'button',
    label: 'train 1000 examples',
    action: async () => {
      if (nnCtx.isRunning) {
        return;
      }

      if (!(await nnCtx.getIsInitialized())) {
        await nnCtx.init(nnCtx.definition);
        setOutputData({ responseMatrix: [], costs: null });
      }

      nnCtx.isRunning = true;
      const costs = await nnCtx.trainWithSourceFunction(sourceFn, 1_000, [0, 1]);

      const responseMatrix = await nnCtx.computeResponseMatrix(80, [0, 1]);
      setOutputData({ responseMatrix, costs });
      nnCtx.isRunning = false;
    },
  },
  {
    type: 'button',
    label: 'train 1 example',
    action: async () => {
      if (nnCtx.isRunning) {
        return;
      }

      if (!(await nnCtx.getIsInitialized())) {
        await nnCtx.init(nnCtx.definition);
      }

      nnCtx.isRunning = true;
      const costs = await nnCtx.trainWithSourceFunction(sourceFn, 1, [0, 1]);

      const responseMatrix = await nnCtx.computeResponseMatrix(80, [0, 1]);
      setOutputData({ responseMatrix, costs });
      nnCtx.isRunning = false;
    },
  },
];

type OutputDataAction = {
  responseMatrix: ResponseMatrix;
  costs: Float32Array | null;
};

const outputDataReducer = (state: OutputData, action: OutputDataAction): OutputData => ({
  responseMatrix: action.responseMatrix,
  costs: action.costs ? [...state.costs, ...action.costs] : [],
});

const RuntimeControls: React.FC<RuntimeControlsProps> = ({ nnCtx }) => {
  const [outputData, dispatchOutputData] = useReducer(outputDataReducer, {
    responseMatrix: [],
    costs: [],
  } as OutputData);
  const [{ sourceFn }, setSourceFn] = useState({
    sourceFn: buildSourceFn(SourceFnType.ComplexFancy),
  });
  const setOutputData = useCallback((action: OutputDataAction) => dispatchOutputData(action), []);
  const settings = useMemo(
    () => buildSettings(nnCtx, sourceFn, setOutputData),
    [nnCtx, setOutputData, sourceFn]
  );

  return (
    <div className='runtime-controls'>
      <ControlPanel
        style={{ width: 800 }}
        settings={settings}
        onChange={(_key: string, val: any) => {
          setSourceFn({ sourceFn: buildSourceFn(+val) });
        }}
      />
      {outputData ? <OutputDataDisplay nnCtx={nnCtx} sourceFn={sourceFn} {...outputData} /> : null}
    </div>
  );
};

export default RuntimeControls;
