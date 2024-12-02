import { Pipeline } from ".";

describe("Pipeline", () => {
  let pipeline: Pipeline;

  beforeEach(() => {
    pipeline = new Pipeline();
  });

  it("should run step with state", () => {
    const fn = jest.fn(() => {});

    pipeline.step('1', fn);

    const states = [1,2];
    pipeline.run1(['1'], states);
    
    expect(fn.mock.calls).toEqual([[1], [2]]);
  });

  it('should run batched step', () => {
    const data = [];
    const batchedFn = jest.fn((arg) => {
      data.push(`batched ${arg}`)
    });

    const batchDoneRun = jest.fn(() => {
      data.push(`batched done`);
    })

    const justFn = jest.fn((arg) => {
      data.push(`every ${arg}`)
    });

    pipeline
      .step('batched', batchedFn, { batched: true, batchDone: batchDoneRun })
      .step('every1', justFn, { batched: false })
      .step('every2', justFn, { batched: false })
      .run1(['batched', 'every1', 'every2', 'batched'], [1,2]);

    expect(data).toEqual([
      'batched 1',
      'batched 2',
      'batched done',

      'every 1',
      'every 1',
      
      'every 2',
      'every 2',
      
      'batched 1',
      'batched 2',
      'batched done'
    ])
  });

  it('shoild run done batch on change result', () => {
    const data = [];
    const batchedFn = jest.fn().mockImplementation((arg: number) => {
      data.push(`batched ${arg}`);
    });

    const batchDoneRun = jest.fn(() => {
      data.push(`batched done`);
    })

    pipeline
      .step('batched', batchedFn, { batched: true, batchDone: batchDoneRun, getBatchType: (state: number) =>  state <= 2 ? 'one' : 'two' })
      .run1(['batched'], [1, 2, 3, 4]);

    expect(data).toEqual([
      `batched 1`,
      `batched 2`,
      `batched done`,
      `batched 3`,
      `batched 4`,
      `batched done`,
    ])
  });
});
