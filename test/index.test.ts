/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as fs from 'node:fs';
import { expect } from 'chai';
import { createSandbox, SinonSandbox } from 'sinon';
import { fromStub, spyMethod, stubCallable, stubInterface, stubMethod, stubObject } from '../src/index';

describe('stubs', () => {
  let sandbox: SinonSandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should stub an interface', () => {
    type FileSystem = Pick<typeof fs, 'readFileSync' | 'writeFileSync'>;

    const stub = stubInterface<FileSystem>(sandbox, {
      // readFileSync included to test explicit stub impl
      readFileSync: (filename: string) => Buffer.from(`data from ${filename}`),
      // writeFileSync omitted to test implicit stubbing via proxy
    });

    // verify an explicitly defined method is invoked
    const data = stub.readFileSync('foo');
    expect(data.toString()).to.equal('data from foo');
    expect(stub.readFileSync.calledOnce).to.be.true;

    // verify an undefined method is invoked via proxy
    stub.writeFileSync('foo', 'bar');
    expect(stub.writeFileSync.calledOnce).to.be.true;
  });

  it('should stub a class instance with private fields', async () => {
    type Callable = {
      (): string;
      property?: string;
    };
    class Target {
      public property: {
        value: boolean;
      };
      public normalCallable: Callable;
      public overrideCallable: Callable;
      public constructor(value: boolean) {
        this.property = { value };
        this.normalCallable = (): string => 'normal';
        this.normalCallable.property = 'default';
        this.overrideCallable = (): string => 'override';
        this.overrideCallable.property = 'default';
      }
      public normalMethod(): string {
        return `normal:${this.property.value}`;
      }
      public overrideMethod(): string {
        return `override:${this.property.value}`;
      }
      public async returnAsync(): Promise<string> {
        return this.getAsync();
      }
      private async getAsync(): Promise<string> {
        return Promise.resolve(`done:${this.property.value}`);
      }
    }

    const stub = stubObject(sandbox, new Target(true), {
      overrideCallable: stubCallable(
        sandbox,
        {
          property: 'overrideCallable',
        },
        () => 'overrideCallable'
      ),
      overrideMethod() {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-unsafe-member-access
        return `overridden:${this.property.value}`;
      },
    });

    expect(stub.normalMethod()).to.equal('normal:true');
    expect(stub.normalMethod.calledOnce).to.be.true;
    expect(stub.overrideMethod()).to.equal('overridden:true');
    expect(stub.overrideMethod.calledOnce).to.be.true;
    expect(stub.property.value).to.be.true;
    expect(await stub.returnAsync()).to.equal('done:true');
    expect(stub.normalCallable()).to.equal('normal');
    expect(stub.normalCallable.calledOnce).to.be.true;
    expect(stub.normalCallable.property).to.equal('default');
    expect(stub.overrideCallable()).to.equal('overrideCallable');
    expect(stub.overrideCallable.calledOnce).to.be.true;
    expect(stub.overrideCallable.property).to.equal('overrideCallable');

    // Stub can be coerced back to a usable object of the original type
    function useTarget(target: Target): Target {
      return target;
    }
    const result = useTarget(fromStub(stub));
    expect(result).to.equal(stub);
  });

  it('should resolve a stub', async () => {
    const stub = stubObject(sandbox, {});
    expect(await Promise.resolve(stub)).to.equal(stub);
  });

  it('should resolve a stub from an interface', async () => {
    // stubInterface will stub missing properties and return a stub for those missing
    // properties, which includes a .then method. This could cause a promise chain to
    // hang if not handled in ts-sinon.
    const stub = stubInterface(sandbox);
    expect(await Promise.resolve(stub)).to.equal(stub);
  });

  it('should stub when target has a then method', () => {
    const stub = stubObject<{ then: () => string }>(sandbox, {
      then: () => 'test',
    });
    expect(stub.then()).to.equal('test');
  });

  it('should stub when members have a then method', () => {
    const stub = stubInterface<{ then: () => string }>(sandbox, {
      then: () => 'test',
    });
    expect(stub.then()).to.equal('test');
  });

  it('should stub a callable', () => {
    type Callable = {
      (): string;
      foo: () => string;
      bar: boolean;
    }

    const stub = stubCallable<Callable>(
      sandbox,
      {
        foo: () => 'ret2',
        bar: true,
      },
      () => 'ret1'
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const ret1 = stub();
    const ret2 = stub.foo();

    expect(ret1).to.equal('ret1');
    expect(ret2).to.equal('ret2');
    expect(stub.calledOnce).to.be.true;
    expect(stub.foo.calledOnce).to.be.true;
    expect(stub.bar).to.be.true;
  });

  it('should stub an interface with no members', () => {
    type FileSystem = Pick<typeof fs, 'readFileSync'>;
    const stub = stubInterface<FileSystem>(sandbox);
    stub.readFileSync('foo', 'bar');
    expect(stub.readFileSync.calledOnce).to.be.true;
  });

  it('should stub an object with no members', () => {
    const obj = { foo: (): string => 'foo' };
    const stub = stubObject<typeof obj>(sandbox, obj);
    stub.foo();
    expect(stub.foo.calledOnce).to.be.true;
  });

  it('should stub a callable with no members or fake', () => {
    const stub = stubCallable(sandbox);
    stub();
    expect(stub.calledOnce).to.be.true;
  });

  it('should stub a private method', () => {
    class Foo {
      private testVal = '';

      public test(): string {
        return this.t();
      }

      private t(): string {
        return this.testVal;
      }
    }

    stubMethod(sandbox, Foo.prototype, 't').returns('45678');
    expect(new Foo().test()).to.equal('45678');
  });

  it('should create a spy on a private method', () => {
    class Foo {
      private testVal = '';

      public test(): string {
        return this.t();
      }

      private t(): string {
        return this.testVal;
      }
    }

    const spy = spyMethod(sandbox, Foo.prototype, 't');
    new Foo().test();
    expect(spy.callCount).to.equal(1);
  });
});
