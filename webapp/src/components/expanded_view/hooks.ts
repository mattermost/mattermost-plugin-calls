import {isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {useState} from 'react';
import {useSelector} from 'react-redux';
import {areHostControlsAllowed} from 'src/selectors';

export const useHostControls = (isYou: boolean, isHost: boolean, iAmHost: boolean) => {
    const isAdmin = useSelector(isCurrentUserSystemAdmin);
    const hostControlsAllowed = useSelector(areHostControlsAllowed);

    const [hover, setHover] = useState(false);
    const hoverOn = () => setHover(true);
    const hoverOff = () => setHover(false);

    const hostControlsAvailable = hostControlsAllowed && (iAmHost || isAdmin);

    // Show host controls when allowed + hover, but don't show if this is me and I'm the host already,
    const showHostControls = hostControlsAvailable && hover && !(isYou && isHost);

    return {
        hoverOn,
        hoverOff,
        hostControlsAvailable,
        showHostControls,
    };
};
