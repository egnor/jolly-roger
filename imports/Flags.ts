import { check } from 'meteor/check';
import type { FeatureFlagType } from './lib/models/FeatureFlags';
import FeatureFlags from './lib/models/FeatureFlags';

function flagIsActive(flag: Pick<FeatureFlagType, 'type'> | undefined) {
  if (!flag) {
    return false;
  }

  switch (flag.type) {
    case 'on':
      return true;
    case 'off':
      return false;
    default:
      return false;
  }
}

const Flags = {
  active(name: unknown) {
    check(name, String);

    const flag = FeatureFlags.findOne({ name });
    return flagIsActive(flag);
  },

  async activeAsync(name: unknown) {
    check(name, String);

    const flag = await FeatureFlags.findOneAsync({ name });
    return flagIsActive(flag);
  },

  observeChanges(name: unknown, cb: (active: boolean) => void) {
    check(name, String);
    check(cb, Function);

    let state: FeatureFlagType | undefined;
    const checkUpdate = (_id: string, flag?: Partial<FeatureFlagType>) => {
      let newState;
      if (flag) {
        newState = { ...state ?? {}, ...flag } as FeatureFlagType;
      } else {
        newState = undefined;
      }
      const newActive = flagIsActive(newState);
      if (flagIsActive(state) !== newActive) {
        state = newState;
        cb(newActive);
      }
    };
    const handle = FeatureFlags.find({ name }).observeChanges({
      added: checkUpdate,
      changed: checkUpdate,
      removed: checkUpdate,
    });

    // If state is still undefined, then the record does not exist yet and we
    // should explicitly initialize it to false.
    if (state === undefined) {
      cb(false);
    }

    return handle;
  },
};

export default Flags;
