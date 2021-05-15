import React,{useEffect, useState, useRef} from 'react';
import Player from './Player';
import Chat from './Chat';
import PlayList from './PlayList';
import Members from './Members';
import styles from './room.module.css';
import config from '../../config';
import { useLocation } from "react-router-dom";
import LocalStorage from '../../utils/local_storage';
import firestore from '../../config/firestore';
import Button from '../../common/Button';
import PageLoader from '../../common/PageLoader';
import helper from './helper';

let prevMsg = 0;
const copyText = 'COPY LINK';

function Room() {
    const location = useLocation();
    const ref = useRef();
    const [src, setSrc] = useState();
    const [ name , setName ] = useState('YOU');
    const [active, setActive] = useState(0);
    const [ playing, setPlaying ] = useState(false);
    const [seek, setSeek] = useState(0);
    const [loading, setLoading] = useState(true);
    const [msgCounter, setMsgCounter] = useState(0);
    const [isHost, setHost] = useState(false);
    const [copyButtonText, setCopyButton] = useState(copyText);
    const [currUser, setCurrUser]= useState({});
    let [id, setId] = useState(null);
    let [userId, setUserId] = useState(null);
    let [messages, setMessages] = useState([]);
    let [playlist, setPlaylist] = useState([]);
    let [members, setMembers] = useState([]);

    const height = '100%';

    const loadMedia = async (url, force = false, event = true,user = undefined) => {
        const finalSrc = helper.checkURL(url); 
        const tempList = [...playlist];
        setSrc(finalSrc);
        if(event){
            firestore.createEvent(id, config.EVENT.LOAD.KEYWORD, userId, finalSrc);
        }
        if(force){
            if (tempList.length !== 0) {
                tempList.shift();
            }
            tempList.unshift({
                url,
                username: await getUsername(user || currUser.id),
                userId
            });
            playlist = tempList;
            setPlaylist([...playlist]);
        }
        return playlist;
    }

    const appendToPlaylist = async (url) => {
        const finalSrc = helper.checkURL(url);
        const tempList = [...playlist];
        if(finalSrc){
            tempList.push({
                url,
                username: await getUsername(currUser.id),
                userId
            });
            if (tempList.length === 1 && !src) {
                loadMedia(url);
            }
            playlist = tempList;
            setPlaylist([...playlist]);
        }
        return playlist;
    }

    const mediaEnd = (event = true) => {
        const tempList = [...playlist];
        if (tempList.length > 0) {
            if (tempList[0].url === src) {
                tempList.shift();
            }
            if (tempList.length > 0) {
                const playnode = tempList[0];
                loadMedia(playnode.url,false,event);
            }else{
                setSrc(undefined);
                updateRoomProgress(1);
            }
        }
        playlist = tempList;
        setPlaylist([...playlist]);
        return playlist;
    }

    const deletePlaylistItem = (index) => {
        let tempList = [...playlist];
        if (tempList[index].url === src) {
            mediaEnd();
        }
        tempList = tempList.filter((_, i) => i !== index);

        playlist = tempList;
        setPlaylist([...playlist]);
        return playlist;
    }

    const playListAction = async (type,url='',force = false, index = 0) => {
        switch(type) {
            case 0:
                await loadMedia(url,force);
                break;
            case 1:
                await appendToPlaylist(url);
                break;
            case 2:
                url = src;
                mediaEnd();
                break;
            case 3:
                deletePlaylistItem(index);
                break;
            default:
                break;
        }
        firestore.updatePlaylist(playlist, id).then(() => {
            if([1,3].includes(type)){
                createEvent(config.EVENT.PLAYLIST.KEYWORD);
            }
        });
    }

    const checkUsername = () => {
        const key = config.USERNAME_KEY;
        let username = LocalStorage.get(key);
        if(username){
            return username;
        }else{
            do{
                username = prompt('Enter Username');
            }while(username === null);
            LocalStorage.set(key,username);
            return username;
        }
    }

    const updateRoomMembers = async () => {
        const result = await firestore.getMembers(id);
        const list = [];
        result.forEach((member) => {
            const data = member.data();
            list.push({
                id: member.id,
                username: data.username,
                isHost: data.isHost
            });
        });
        members = list;
        setMembers([...members]);
        console.log(members);
    }

    const createMember = async (username) => {
        const user = helper.getUserByName(members, username);
        if (!user) {
            const firstUser = members.length === 0 ? true : false;
            userId = await firestore.createMember(id, username, firstUser); // Making First User as Host by default.
            const data = {
                id: userId,
                username: username,
                isHost: firstUser
            };
            members = helper.addMemberToList(members, data);
            setMembers([...members]);
            firestore.createEvent(id, config.EVENT.ADD.KEYWORD, userId, data);
            setUserId(userId);
            return data;
        }
        setUserId(user.id);
        return user;
    }

    const updateMembers = (username) => {
        const list = [...members];
        let finalIndex = 0;
        let prevName = '';
        members.forEach((member,index) => {
            if(member.id === currUser.id){
                prevName = list[index].username;
                list[index].username = username;
                finalIndex = index;
            }
        });
        members = list;
        setMembers([...members]);
        firestore.updateMembers(id,members[finalIndex]);
        const key = config.USERNAME_KEY;
        LocalStorage.set(key, username);
        createEvent(config.EVENT.USERNAME_UPDATE.KEYWORD,prevName);
    }

    const getUsername = async (user_id) => {
        const user = helper.getUserById(members,user_id);
        let username = user?.username;
        if(username == null){
            if(id && user_id){
                const res = await firestore.findMember(user_id, id);
                if (res) {
                    const data = res.data();
                    if(data){
                        username = data.username;
                        members = helper.addMemberToList(members, data)
                        setMembers([...members]);
                    }
                }
            }
        }
        return username;
    }

    const memberAction = (type, data) => {
        if (type === 1) {
            members = helper.addMemberToList(members, data)
            setMembers([...members]);
        } else if (type === 2) {
            members = helper.removeMemberFromList(members, data);
            setMembers([...members]);
        }
    }

    const checkRoomDetails = async () => {
        const res = await firestore.getARoom(id);
        if (res) {
            const data = res.data();
            if (data.src) {
                setSrc(data.src);
            }
            if (data.progress) {
                setSeek(data.progress);
            }
            if (data?.playlist?.length) {
                playlist = data.playlist;
                setPlaylist([...playlist]);
            } else {
                if (data.src && data.src !== '') {
                    playlist = [{
                        url: data.src
                    }]
                    setPlaylist([...playlist]);
                } else {
                    setPlaylist([]);
                }
            }
        }
    }

    const setRoomId = () => {
        const search = location.search;
        const roomId = new URLSearchParams(search).get('track');
        id = roomId;
        setId(id);
    }

    const updateRoomProgress = (progress) => {
        if(currUser?.isHost){
            firestore.updateRoomDetails(id, src, progress, playlist);
        }
    }

    const createEvent = (type, message = '') => {
        firestore.createEvent(id, type, userId, message);
    }

    const handleEvent = async (event) => {
        const user = event.user;
        const username = await getUsername(user);
        const data = {
            type: event.type,
            username
        }
        let keySearch = true;

        for(let key in config.EVENT){
            if(config.EVENT[key].KEYWORD === event.type){
                keySearch = false;
                data.message = helper.getMessage(config.EVENT[key].MESSAGE, username);
            }
        }
        if(keySearch){
            for (let key in config.EVENT.PLAYER) {
                if (config.EVENT.PLAYER[key].KEYWORD === event.type) {
                    data.message = helper.getMessage(config.EVENT.PLAYER[key].MESSAGE, username, event.message);
                }
            }
        }
        switch (event.type) {
            case config.EVENT.ADD.KEYWORD:
                memberAction(1, event.message);
                break;

            case config.EVENT.REMOVE.KEYWORD:
                memberAction(2, user);
                break;
            case config.EVENT.LOAD.KEYWORD:
                loadMedia(event.message,true,false,user);
                break;
            case config.EVENT.MESSAGE.KEYWORD:
                data.message = event.message;
                break;
            case config.EVENT.PLAYER.PLAY.KEYWORD:
                setPlaying(true);
                break;
            case config.EVENT.PLAYER.PAUSE.KEYWORD:
                setPlaying(false);
                break;
            case config.EVENT.PLAYER.SEEK_FORWARD.KEYWORD:
                if(user !== userId){
                    ref.current.seek('forward', event.message + helper.getTimeDiff(event.createdAt));
                }
                break;
            case config.EVENT.PLAYER.SEEK_BACKWARD.KEYWORD:
                if(user !== userId){
                    ref.current.seek('backward', event.message - helper.getTimeDiff(event.createdAt));
                }
                break;
            case config.EVENT.PLAYLIST.KEYWORD:
                checkRoomDetails(); // [TODO] This is supposed to check just the playlist and not the whole room details.
                break;
            case config.EVENT.GIF.KEYWORD:
                data.message = event.message;
                break;
            case config.EVENT.USERNAME_UPDATE.KEYWORD:
                console.log(event);
                updateRoomMembers();
                break;
            default:
                break;
        }
        return data;
    }

    const navigation = [{
            key: 'Chat',
            counter: msgCounter,
            component: <Chat 
                            className={styles.chat}
                            messages = {messages} 
                            createEvent = {createEvent}
                            height={height}
                        />
        }, 
        {
            key: 'PlayList',
            component: <PlayList 
                            className="chat" 
                            playlist = {playlist} 
                            loadMedia = {loadMedia} 
                            appendToPlaylist = {appendToPlaylist} 
                            mediaEnd = {mediaEnd} 
                            playListAction = {playListAction}
                            setPlaylist = {setPlaylist}
                            height={height}
                        />
        },
        {
            key: 'Members',
            component: <Members
                            members = {members}
                            height={height}
                            currUser = {currUser}
                            updateMembers = {updateMembers}
                        />
        }
    ];

    const copyLink = () => {
        helper.copyURL();
        setCopyButton('COPIED 🙌');
        setTimeout(() => {
            setCopyButton(copyText)
        }, 3000); // After 3 Seconds
    }

    const onRoomLoad = () => {
        setRoomId();
        checkRoomDetails().then(() => {
            setTimeout(() => {
                setLoading(false);
            }, 500);
        });
        const username = checkUsername();
        setName(username);
        updateRoomMembers().then((res) => {
            createMember(username).then((res) => {
                setCurrUser(res);
                setHost(res.isHost);
                let initData = true;
                firestore.events(id).onSnapshot(querySnapshot => {
                    const promiseArray = [];
                    const changes = querySnapshot.docChanges();
                    
                    if(!initData){
                        changes.forEach(change => {
                            promiseArray.push(new Promise((res, rej) => {
                                handleEvent(change.doc.data())?.then((result) => {
                                    res(result);
                                }).catch((ex) => {
                                    rej(ex);
                                })
                            }))
                        });
                    }
                    initData = false;
                    Promise.all(promiseArray).then((newMessages) => {
                        messages = messages.concat(newMessages);
                        if (active === 0) {
                            prevMsg = 0;
                            setMsgCounter(0);
                        } else if (newMessages.length) {
                            setMsgCounter(msgCounter + newMessages.length);
                            prevMsg = messages.length;
                        }
                        setMessages([...messages]);
                    });
                })
            });
        });
    }

    useEffect(()=>{
        onRoomLoad();
        return () => {
            firestore.createEvent(id, config.EVENT.REMOVE.KEYWORD, userId, '');
        }
    },[]);

    const onNavClick = (index) => {
        setActive(index);
        if(index == 0){
            prevMsg = 0;
            setMsgCounter(0);
        }
    }
    
    return (
        <div className={styles.room_container}>
            {loading && <PageLoader title="Loading Room..."/>}
            <nav className={styles.options}>
                {navigation.map((nav, index) => {
                    return <a key={index} className={`${active === index ? styles.nav_active : ''}`} onClick={() => { onNavClick(index) }}>{nav.key}{(nav?.counter ? `(${nav.counter})` : '' )}</a>
                })}
            </nav>
            <div className={styles.wrapper}>
                <Player 
                    className="player" 
                    src={src} 
                    createEvent = {createEvent} 
                    playing={playing} 
                    updateRoomProgress= {updateRoomProgress} 
                    playListAction= {playListAction} 
                    seek={seek} 
                    ref = {ref}
                />
                {navigation[active].component}
            </div>
            <div className={styles.details}>
                {isHost && <Button width={true} onClick={checkRoomDetails}>RE-SYNC</Button>}
                <Button width={true} onClick={copyLink}>{copyButtonText}</Button>
            </div> 
        </div>
    )
}

export default Room
