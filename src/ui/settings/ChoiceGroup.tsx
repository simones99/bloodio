import shared from '../styles/shared.module.css';
import styles from './settings.module.css';

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint: string;
}

interface Props<T extends string> {
  legend: string;
  name: string;
  value: T;
  choices: Choice<T>[];
  onChange(value: T): void;
}

/** A titled group of radio buttons, one per line, each with a hint. */
export function ChoiceGroup<T extends string>({
  legend,
  name,
  value,
  choices,
  onChange,
}: Props<T>) {
  return (
    <fieldset className={styles.choices}>
      <legend className={shared.sectionTitle}>{legend}</legend>
      {choices.map((choice) => (
        <label key={choice.value} className={styles.choice}>
          <input
            type="radio"
            name={name}
            value={choice.value}
            checked={value === choice.value}
            aria-labelledby={`${name}-${choice.value}-title`}
            aria-describedby={`${name}-${choice.value}-hint`}
            onChange={() => onChange(choice.value)}
          />
          <span>
            <span id={`${name}-${choice.value}-title`} className={styles.choiceTitle}>
              {choice.label}
            </span>
            <span id={`${name}-${choice.value}-hint`} className={styles.hint}>
              {choice.hint}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
