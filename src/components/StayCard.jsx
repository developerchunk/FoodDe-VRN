import { useProperty } from "../utils/property";
import { ChefIcon, Cloche, ScooterIcon, ShieldIcon } from "./Icons";

/** The teal card beside the menu: what the service is, and whose room it serves. */
export default function StayCard() {
  const house = useProperty();

  return (
    <div className="stay-card">
      <Cloche size={34} className="stay-card__mark" />
      <h2 className="stay-card__title">Freshly prepared for your room</h2>
      <ul className="stay-card__points">
        <li>
          <ChefIcon size={16} /> Cooked fresh
        </li>
        <li>
          <ScooterIcon size={16} /> Delivered to your door
        </li>
        <li>
          <ShieldIcon size={16} /> Sealed &amp; hygienic
        </li>
      </ul>
      {house.room && <span className="stay-card__room">Room {house.room}</span>}
    </div>
  );
}
